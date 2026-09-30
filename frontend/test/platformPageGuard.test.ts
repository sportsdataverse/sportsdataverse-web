import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Guards the /platform page-data leak found on 2026-09-29. The platform layout
// gates non-members, but App Router renders a layout and its page in parallel
// and ships the page's output in the RSC payload even when the layout never
// displays it: signed-out visitors got the DB inventory, the Data API schema
// list and the release listing. node --test cannot load next-auth, so this
// scans the source, on the TypeScript AST (comments are comments, and names
// resolve to their declarations, so a local that shadows the guard import is
// not the guard). In every file under app/(platform) that is not "use client":
// - every async function starts with `if (!(await requireOrgMember())) return
//   null;` or `const s = await requireOrgMember(); if (!s) return null;`, the
//   callee being the import from @lib/platform/auth; under /platform/admin the
//   guard is requireOrgAdmin. The non-member branch may return a constant
//   (null, a literal title, JSX with literal props) instead of null. An async
//   function nested in a guarded one is covered by it, unless it is a
//   "use server" action (callable on its own). No parameter defaults: they run
//   before the guard. No top-level await.
// - generateMetadata (async or not) may skip the guard only if it awaits
//   nothing but its own params/searchParams and chains no .then/.catch/.finally
//   (link unfurls are always signed out, so a data-read title reaches them).
// - a route entry (page, layout, template, default, loading, not-found, ...)
//   is `export default [async] function`; a sync one has no guard, so it may
//   only `return` constant JSX, which cannot hand a read to a child.
// Known limit: the scan stops at the file. An imported component or helper is
// trusted: keep server components out of components/platform (NonMemberGate,
// which reads only the session, is the exception), and route handlers in
// app/api behind requireMemberApp().
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/
const PLATFORM_DIR = path.join(frontendRoot, 'app', '(platform)');
const AUTH_MODULE = '@lib/platform/auth';
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;
const ENTRY = /^(page|layout|template|default|loading|not-found|forbidden|unauthorized)\.(tsx?|jsx?)$/;

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(full, out);
    else if (CODE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const relOf = (file: string): string => path.relative(frontendRoot, file).split(path.sep).join('/');

type Scan = { problems: string[]; guarded: string[] };
type Fn = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

const isFn = (n: ts.Node): n is Fn =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
const hasModifier = (n: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === kind);
const unparen = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? unparen(e.expression) : e);

/** The directive prologue ("use client", "use server"). */
function directives(stmts: readonly ts.Statement[]): string[] {
  const out: string[] = [];
  for (const s of stmts) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) break;
    out.push(s.expression.text);
  }
  return out;
}

function nameOf(fn: Fn): string {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  return '';
}

/** One type-checker over in-memory sources, imports unresolved: enough to bind every name in a file. */
function checkerOf(sources: Map<string, string>): { program: ts.Program; checker: ts.TypeChecker } {
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, allowJs: true, jsx: ts.JsxEmit.Preserve, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name, lang) => {
    const text = sources.get(name);
    return text === undefined ? undefined : ts.createSourceFile(name, text, lang, true);
  };
  host.fileExists = (name) => sources.has(name);
  host.readFile = (name) => sources.get(name);
  const program = ts.createProgram([...sources.keys()], options, host);
  return { program, checker: program.getTypeChecker() };
}

function scanFile(sf: ts.SourceFile, checker: ts.TypeChecker, rel: string): Scan {
  const problems: string[] = [];
  const guarded: string[] = [];
  if (directives(sf.statements).includes('use client')) return { problems, guarded };
  const admin = /\/platform\/admin\//.test(rel);
  const guards = admin ? ['requireOrgAdmin'] : ['requireOrgMember', 'requireOrgAdmin'];
  const GUARD = `\`if (!(await ${guards[0]}())) return null;\``;
  const line = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const fail = (n: ts.Node, what: string, why: string): void => {
    problems.push(`${what} (line ${line(n)}): ${why}`);
  };

  /** The binding an identifier names, when it is an import: `{ name, module }`. */
  function importOf(id: ts.Identifier): { name: string; module: string } | null {
    const decls = checker.getSymbolAtLocation(id)?.declarations ?? [];
    const d = decls[0];
    if (decls.length !== 1) return null;
    const clause = ts.isImportSpecifier(d) ? d.parent.parent : ts.isImportClause(d) ? d : null;
    if (!clause || clause.isTypeOnly || (ts.isImportSpecifier(d) && d.isTypeOnly)) return null;
    const spec = clause.parent.moduleSpecifier;
    if (!ts.isStringLiteral(spec)) return null;
    return { name: ts.isImportSpecifier(d) ? (d.propertyName ?? d.name).text : 'default', module: spec.text };
  }

  // Constant: no value from this scope reaches it. JSX tags must be HTML or an import.
  function isConstant(e: ts.Expression): boolean {
    e = unparen(e);
    switch (e.kind) {
      case ts.SyntaxKind.NullKeyword:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        return true;
    }
    if (ts.isObjectLiteralExpression(e)) {
      return e.properties.every((p) => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && isConstant(p.initializer));
    }
    if (ts.isArrayLiteralExpression(e)) return e.elements.every(isConstant);
    if (ts.isJsxFragment(e)) return e.children.every(constantChild);
    if (ts.isJsxSelfClosingElement(e)) return constantTag(e);
    if (ts.isJsxElement(e)) return constantTag(e.openingElement) && e.children.every(constantChild);
    return false;
  }
  function constantChild(c: ts.JsxChild): boolean {
    if (ts.isJsxText(c)) return true;
    if (ts.isJsxExpression(c)) return !c.expression || isConstant(c.expression);
    return isConstant(c);
  }
  function constantTag(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
    const tag = el.tagName;
    if (!ts.isIdentifier(tag) || !(/^[a-z]/.test(tag.text) || importOf(tag))) return false;
    return el.attributes.properties.every(
      (a) =>
        ts.isJsxAttribute(a) &&
        (!a.initializer ||
          ts.isStringLiteral(a.initializer) ||
          (ts.isJsxExpression(a.initializer) && !!a.initializer.expression && isConstant(a.initializer.expression))),
    );
  }

  function isDeny(s: ts.Statement): boolean {
    if (ts.isBlock(s)) return s.statements.length === 1 && isDeny(s.statements[0]);
    return ts.isReturnStatement(s) && (!s.expression || isConstant(s.expression));
  }
  /** `if (!x) return <constant>;` with no else: x. */
  function negated(s: ts.Statement | undefined): ts.Expression | null {
    if (!s || !ts.isIfStatement(s) || s.elseStatement || !isDeny(s.thenStatement)) return null;
    const c = unparen(s.expression);
    return ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken ? unparen(c.operand) : null;
  }
  /** `await g()`: g, a bare name called with no arguments. */
  function awaitedCall(e: ts.Expression | undefined): ts.Identifier | null {
    if (!e || !ts.isAwaitExpression(unparen(e))) return null;
    const call = unparen((unparen(e) as ts.AwaitExpression).expression);
    return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.arguments.length === 0 && !call.questionDotToken
      ? call.expression
      : null;
  }
  /** The guard's callee when `stmts` open with either guard form. */
  function guardCallee(stmts: readonly ts.Statement[]): ts.Identifier | null {
    const first = negated(stmts[0]);
    if (first) return awaitedCall(first);
    const decl = stmts[0];
    if (!decl || !ts.isVariableStatement(decl) || !(decl.declarationList.flags & ts.NodeFlags.Const)) return null;
    const [v, ...more] = decl.declarationList.declarations;
    const checked = negated(stmts[1]);
    if (more.length || !ts.isIdentifier(v.name) || !checked || !ts.isIdentifier(checked) || checked.text !== v.name.text) return null;
    return awaitedCall(v.initializer);
  }
  function hasParamDefault(fn: Fn): boolean {
    const walk = (n: ts.Node): boolean =>
      ((ts.isParameter(n) || ts.isBindingElement(n)) && !!n.initializer) || !!ts.forEachChild(n, (c) => (walk(c) ? true : undefined));
    return fn.parameters.some(walk);
  }
  /** Why fn does not open with the guard, or null. */
  function guardProblem(fn: Fn): string | null {
    if (hasParamDefault(fn)) return 'a parameter default runs before the guard: drop it';
    if (!fn.body || !ts.isBlock(fn.body)) return `give it a block body that starts with ${GUARD}`;
    const stmts = fn.body.statements.slice(directives(fn.body.statements).length);
    const callee = guardCallee(stmts);
    if (!callee) return `its first statement must be ${GUARD} (or \`const s = await ${guards[0]}(); if (!s) return null;\`)`;
    const imp = importOf(callee);
    if (!imp || imp.module !== AUTH_MODULE) return `\`${callee.text}\` there is not the import from ${AUTH_MODULE}`;
    if (!guards.includes(imp.name)) return `under /platform/admin the guard is ${guards[0]}(), not ${imp.name}()`;
    return null;
  }
  /** generateMetadata that awaits only its own params/searchParams and chains no promise. */
  function paramsOnly(fn: Fn): boolean {
    const params = new Set<ts.Symbol>();
    const bind = (n: ts.BindingName): void => {
      if (ts.isIdentifier(n)) {
        const s = checker.getSymbolAtLocation(n);
        if (s) params.add(s);
      } else for (const el of n.elements) if (!ts.isOmittedExpression(el)) bind(el.name);
    };
    fn.parameters.forEach((p) => bind(p.name));
    let ok = true;
    const walk = (n: ts.Node): void => {
      if (isFn(n)) return; // checked on its own
      if (ts.isForOfStatement(n) && n.awaitModifier) ok = false;
      if (ts.isAwaitExpression(n)) {
        const x = unparen(n.expression);
        const root = ts.isPropertyAccessExpression(x) && /^(params|searchParams)$/.test(x.name.text) ? unparen(x.expression) : x;
        const s = ts.isIdentifier(root) ? checker.getSymbolAtLocation(root) : undefined;
        if (!s || !params.has(s)) ok = false;
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(then|catch|finally)$/.test(n.expression.name.text)) ok = false;
      ts.forEachChild(n, walk);
    };
    if (fn.body) walk(fn.body);
    return ok;
  }

  if (ENTRY.test(path.basename(rel))) {
    const def = sf.statements.find(
      (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && hasModifier(s, ts.SyntaxKind.DefaultKeyword),
    );
    if (!def?.body) {
      problems.push('write the default export as `export default [async] function` so this scan can check it');
    } else if (!hasModifier(def, ts.SyntaxKind.AsyncKeyword)) {
      const [ret, ...rest] = def.body.statements;
      if (rest.length || !ret || !ts.isReturnStatement(ret) || !ret.expression || !isConstant(ret.expression)) {
        fail(def, 'default export', `a sync route entry has no guard, so it may only \`return\` constant JSX (literal props): make it async and start it with ${GUARD}`);
      }
    }
  }

  const visit = (node: ts.Node, inFn: boolean, covered: boolean): void => {
    if (!inFn && (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier))) {
      fail(node, 'top-level await', 'it runs outside any guard');
    }
    if (isFn(node)) {
      const name = nameOf(node);
      const label = hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default export' : name || 'async function';
      const action = !!node.body && ts.isBlock(node.body) && directives(node.body.statements).includes('use server');
      if ((hasModifier(node, ts.SyntaxKind.AsyncKeyword) || name === 'generateMetadata') && (!covered || action)) {
        const why = guardProblem(node);
        if (!why) {
          guarded.push(label);
          covered = true;
        } else if (name === 'generateMetadata' && !hasParamDefault(node) && paramsOnly(node)) {
          // params-only: nothing to leak
        } else {
          fail(node, label, name === 'generateMetadata' ? `${why}, or await nothing but its own params/searchParams` : why);
        }
      }
      ts.forEachChild(node, (c) => visit(c, true, covered));
      return;
    }
    ts.forEachChild(node, (c) => visit(c, inFn, covered));
  };
  visit(sf, false, false);
  return { problems, guarded };
}

/** Scan one source as if it lived at `rel` (default: an ordinary platform page). */
export function scanSource(source: string, rel = 'app/(platform)/platform/x/page.tsx'): Scan {
  const file = path.join(frontendRoot, rel);
  const { program, checker } = checkerOf(new Map([[file, source]]));
  return scanFile(program.getSourceFile(file)!, checker, rel);
}

function scanTree(): Map<string, Scan> {
  const sources = new Map(codeFiles(PLATFORM_DIR).map((f) => [f, fs.readFileSync(f, 'utf8')] as const));
  const { program, checker } = checkerOf(sources);
  return new Map([...sources.keys()].map((f) => [relOf(f), scanFile(program.getSourceFile(f)!, checker, relOf(f))]));
}

test('every server function under app/(platform) opens with the member guard (admin guard under /platform/admin)', () => {
  const offenders = [...scanTree()].flatMap(([rel, { problems }]) => problems.map((p) => `${rel}: ${p}`));
  assert.deepEqual(offenders, [], `server reads under /platform reach non-members through the RSC payload:\n${offenders.join('\n')}`);
});

test('the scan reaches the pages that leaked and both layouts, and sees each guarded', () => {
  const scans = scanTree();
  for (const name of ['database', 'query', 'datasets', 'explore']) {
    const rel = `app/(platform)/platform/${name}/page.tsx`;
    assert.ok(scans.has(rel), `${rel} is missing from the scan`);
    assert.ok(scans.get(rel)!.guarded.includes('default export'), `${rel}: the scan does not see a guarded async default export`);
  }
  for (const rel of ['app/(platform)/platform/layout.tsx', 'app/(platform)/platform/admin/layout.tsx', 'app/(platform)/platform/admin/community/[id]/page.tsx']) {
    assert.ok(scans.get(rel)?.guarded.includes('default export'), `${rel}: not seen as guarded`);
  }
});

test('the scan walks every Next route file kind, including .js/.jsx and @slot folders', () => {
  for (const name of ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'layout.tsx', 'template.tsx', 'default.tsx', 'loading.tsx', 'not-found.tsx']) {
    assert.ok(CODE.test(name) && ENTRY.test(name), name);
  }
  for (const name of ['route.ts', 'opengraph-image.tsx', 'Helper.jsx']) assert.ok(CODE.test(name), name); // async functions in these need the guard too
  assert.deepEqual(scanSource('export default async function D() {\n  return await listRuns();\n}', 'app/(platform)/platform/@modal/default.js').problems.length, 1);
});

const IMP = 'import { requireOrgMember } from "@lib/platform/auth";\n';
const ADMIN_IMP = 'import { requireOrgAdmin } from "@lib/platform/auth";\n';
const page = (body: string, head = IMP) => `${head}export default async function P({ params, searchParams }) {\n${body}\n}`;
const problemsOf = (src: string, rel?: string) => scanSource(src, rel).problems;
const DEF = '\nexport default function P() {\n  return <div />;\n}';

test('guarded forms, static sync pages and params-only generateMetadata pass', () => {
  for (const src of [
    page('  if (!(await requireOrgMember())) return null;\n  const x = await listRuns();\n  return x;'),
    page('  const session = await requireOrgMember();\n  if (!session) return null;\n  return session.role;'),
    page('  if (!(await requireOrgMember())) {\n    return null;\n  }\n  const run = async () => listRuns();\n  return await run();'),
    `${IMP}import NonMemberGate from "@components/platform/NonMemberGate";\nexport default async function L({ children }) {\n  const s = await requireOrgMember();\n  if (!s) return <NonMemberGate />;\n  return <main>{children}</main>;\n}`,
    `${IMP}export async function generateMetadata({ params }) {\n  if (!(await requireOrgMember())) return { title: "Run" };\n  return { title: (await getRun((await params).id)).model_id };\n}${DEF}`,
    `import { ogMetadata } from "@lib/ogSummary";\nexport async function generateMetadata({ searchParams }) {\n  return ogMetadata("explore", toSearchParams(await searchParams));\n}${DEF}`,
    `export async function generateMetadata(props) {\n  const { id } = await props.params;\n  return { title: id.slice(0, 8) };\n}${DEF}`,
    'import { Suspense } from "react";\nimport C from "./C";\nexport default function P() {\n  return (\n    <Suspense fallback={<p className="x">Loading…</p>}>\n      <C mode="a" />\n    </Suspense>\n  );\n}',
  ]) {
    assert.deepEqual(problemsOf(src), [], src);
  }
  assert.deepEqual(problemsOf(page('  if (!(await requireOrgAdmin())) return null;\n  return 1;', ADMIN_IMP), 'app/(platform)/platform/admin/x/page.tsx'), []);
});

// The 2026-09-29 review's probes against the regex scan (all but #7 passed it).
const PROBES: Record<string, string> = {
  // (a) a comment containing "export default function" made an async page look sync
  commentSaysSync: `${IMP}// NB: never write export default function here\nexport default async function P() {\n  const x = await listDbStatuses();\n  return x;\n}`,
  // (b) the first "await" and first "return null" both inside a comment
  commentGuard: `${IMP}export default async function P() {\n  // await requireOrgMember() first, else return null;\n  const x = await listDbStatuses();\n  return x;\n}`,
  // (c) guard awaited, result never checked
  unchecked: `${IMP}export default async function P({ searchParams }) {\n  const s = await requireOrgMember();\n  if (!searchParams) return null;\n  const x = await listDbStatuses();\n  return x;\n}`,
  // (d) inverted condition
  inverted: `${IMP}export default async function P() {\n  if (await requireOrgMember()) return null;\n  return await listDbStatuses();\n}`,
  // sync page handing an unawaited read to a client component
  syncPromise: 'export default function P() {\n  return <C data={listDbStatuses()} />;\n}',
  // (e) a local shadowing the import
  shadow: `${IMP}import { requireOrgMember as _r } from "x";\nexport default async function P() {\n  const requireOrgMember = async () => true;\n  if (!(await requireOrgMember())) return null;\n  return await listDbStatuses();\n}`,
  member: `${IMP}export default async function P() {\n  if (!(await fake.requireOrgMember())) return null;\n  return 1;\n}`,
};

test('every probe from the regex-scan review fails', () => {
  for (const [name, src] of Object.entries(PROBES)) assert.notDeepEqual(problemsOf(src), [], name);
});

test('the gaps the review listed fail too', () => {
  const failing: Record<string, [string, string?]> = {
    shadowAfterGuard: [page('  if (!(await requireOrgMember())) return null;\n  return 1;').replace('({ params, searchParams })', '({ requireOrgMember })')],
    wrongModule: ['import { requireOrgMember } from "@lib/elsewhere";\n' + page('  if (!(await requireOrgMember())) return null;\n  return 1;', '')],
    typeOnlyImport: [page('  if (!(await requireOrgMember())) return null;\n  return 1;', 'import type { requireOrgMember } from "@lib/platform/auth";\n')],
    lateGuard: [page('  const sp = await searchParams;\n  if (!(await requireOrgMember())) return null;')],
    dataInDenyBranch: [page('  if (!(await requireOrgMember())) return <C rows={listRuns()} />;\n  return 1;')],
    elseBranch: [page('  if (!(await requireOrgMember())) return null;\n  else return 1;')],
    paramDefault: [`${IMP}export default async function P({ params }, rows = listRuns()) {\n  if (!(await requireOrgMember())) return null;\n  return rows;\n}`],
    asyncChildOfSyncPage: [`${IMP}async function Rows() {\n  return <C rows={await listRuns()} />;\n}\nexport default function P() {\n  return <Rows />;\n}`],
    asyncArrowChild: ['const Rows = async () => <C rows={await listRuns()} />;\nexport default function P() {\n  return <div />;\n}'],
    metadataReads: [`export async function generateMetadata({ params }) {\n  return { title: (await getRun((await params).id)).model_id };\n}${DEF}`],
    metadataThen: [`export async function generateMetadata() {\n  return listRuns().then((r) => ({ title: r[0].model_id }));\n}${DEF}`],
    syncMetadataThen: [`export function generateMetadata() {\n  return listRuns().then((r) => ({ title: r[0].model_id }));\n}${DEF}`],
    metadataConstArrow: [`export const generateMetadata = async () => ({ title: (await listRuns())[0].model_id });${DEF}`],
    serverActionInGuardedPage: [page('  if (!(await requireOrgMember())) return null;\n  async function save() {\n    "use server";\n    await writeRow();\n  }\n  return <form action={save} />;')],
    topLevelAwait: ['const rows = await listRuns();\nexport default function P() {\n  return <div />;\n}'],
    arrowDefault: ['const P = async () => null;\nexport default P;'],
    unguardedLayout: ['export default async function L({ children }) {\n  const s = await auth();\n  return children;\n}', 'app/(platform)/platform/x/layout.tsx'],
    loadingJsx: ['export default async function Loading() {\n  return await listRuns();\n}', 'app/(platform)/platform/x/loading.jsx'],
    memberGuardInAdmin: [page('  if (!(await requireOrgMember())) return null;\n  return 1;'), 'app/(platform)/platform/admin/x/page.tsx'],
    memberGuardInAdminMetadata: [`${IMP}export async function generateMetadata() {\n  if (!(await requireOrgMember())) return { title: "x" };\n  return { title: (await listRuns())[0].id };\n}${DEF}`, 'app/(platform)/platform/admin/x/page.tsx'],
  };
  for (const [name, [src, rel]] of Object.entries(failing)) {
    const problems = problemsOf(src, rel);
    assert.notDeepEqual(problems, [], name);
    if (name !== 'arrowDefault') assert.ok(!problems.some((p) => p.startsWith('write the default export')), `${name} failed for the wrong reason`);
  }
  assert.match(problemsOf(failing.shadowAfterGuard[0])[0], /not the import/);
  assert.match(problemsOf(failing.memberGuardInAdmin[0], failing.memberGuardInAdmin[1])[0], /requireOrgAdmin\(\), not requireOrgMember/);
  assert.deepEqual(problemsOf('"use client";\nexport default function P() {\n  const go = async () => fetch("/api/x");\n  return <button onClick={go} />;\n}'), []);
});
