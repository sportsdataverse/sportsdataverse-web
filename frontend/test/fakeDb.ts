// The four driver calls lib/ uses, over plain arrays. Filters are equality on
// top-level keys; updates support $set, $setOnInsert, $inc with dotted paths.
type Doc = Record<string, unknown>;

function setPath(doc: Doc, path: string, value: unknown) {
  const parts = path.split('.');
  let cur: Doc = doc;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Doc;
  }
  cur[parts[parts.length - 1]] = value;
}

function getPath(doc: Doc, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = doc;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Doc)[p];
  }
  return cur;
}

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, v]) => {
    // Support $or: an array of sub-filters, matches when any one does.
    if (k === '$or' && Array.isArray(v)) {
      return (v as Doc[]).some((sub) => matches(doc, sub));
    }
    const path = k.includes('.') ? getPath(doc, k) : doc[k];
    // Support $exists operator
    if (typeof v === 'object' && v !== null && '$exists' in v) {
      const exists = path !== undefined;
      return exists === (v as { $exists: boolean }).$exists;
    }
    // Support $ne operator (e.g. `published: { $ne: true }` — an "open" row:
    // absent or anything other than the excluded value, same as real Mongo).
    if (typeof v === 'object' && v !== null && '$ne' in v) {
      return String(path) !== String((v as { $ne: unknown }).$ne);
    }
    return String(path) === String(v);
  });
}

/**
 * The equality fields of a filter — what a real Mongo upsert copies into a
 * newly-inserted document. Only plain `field: value` entries qualify; a
 * top-level operator key (`$or`) and an operator-valued field (`{ $ne: ... }`,
 * `{ $exists: ... }`) are never literal values and must NOT be copied in —
 * e.g. `published: { $ne: true }` must not put a `$ne` object on the new doc.
 */
function equalityFields(filter: Doc): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue;
    const isOperatorObject =
      v !== null && typeof v === 'object' && !(v instanceof Date) && Object.keys(v as Doc).some((kk) => kk.startsWith('$'));
    if (isOperatorObject) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Real MongoDB refuses an update that names the same path — or one path that
 * is a dotted prefix of another — in two different operators: `$set: { wants:
 * {...} }` beside `$setOnInsert: { 'wants.stickers': false }` conflicts just
 * as much as the same exact path would, and so does `$set`/`$unset` on one
 * path. Mirroring this (across $set, $setOnInsert, $unset and $inc, checked
 * before the match — a conflicting update is invalid even when it matches no
 * document) is what stops that class of collision from passing every test
 * and then failing every write in production.
 */
function conflictingPath(a: string, b: string): string | null {
  if (a === b) return a;
  if (a.startsWith(b + '.')) return a;
  if (b.startsWith(a + '.')) return b;
  return null;
}

function checkPathConflicts(update: Doc): void {
  const OPERATORS = ['$set', '$setOnInsert', '$unset', '$inc'] as const;
  const entries: { op: (typeof OPERATORS)[number]; path: string }[] = [];
  for (const op of OPERATORS) {
    for (const path of Object.keys((update[op] as Doc) ?? {})) entries.push({ op, path });
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      // same operator too: Mongo rejects $set: { wants: {…}, 'wants.x': … } (a JS object
      // cannot repeat a key, so within one operator only a prefix overlap can occur)
      const conflict = conflictingPath(entries[i].path, entries[j].path);
      if (conflict) throw new Error(`Updating the path '${conflict}' would create a conflict at '${conflict}'`);
    }
  }
}

function apply(doc: Doc, update: Doc, inserting: boolean) {
  for (const [k, v] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, k, v);
  if (inserting) for (const [k, v] of Object.entries((update.$setOnInsert as Doc) ?? {})) setPath(doc, k, v);
  for (const [k, v] of Object.entries((update.$inc as Doc) ?? {})) {
    setPath(doc, k, (Number(getPath(doc, k) ?? 0) + Number(v)));
  }
  for (const k of Object.keys((update.$unset as Doc) ?? {})) {
    const parts = k.split('.');
    let cur: Doc | undefined = doc;
    for (const seg of parts.slice(0, -1)) cur = typeof cur?.[seg] === 'object' ? (cur[seg] as Doc) : undefined;
    if (cur) delete cur[parts[parts.length - 1]];
  }
}

let nextId = 1;

export function fakeDb() {
  const store = new Map<string, Doc[]>();
  const rows = (name: string) => store.get(name) ?? store.set(name, []).get(name)!;
  let nextUpdateShouldFail: { code?: number } | null = null;
  let nextReadShouldFail: { code?: number } | null = null;
  const nextWriteFailure = new Map<string, Error>();
  // How many write operations — updateOne, findOneAndUpdate, insertOne, deleteOne,
  // deleteMany — have run on one collection. Counted on entry, so an armed failure
  // still counts as a write that ran (a real Mongo call that errors still went out
  // over the wire). Lets a test pin "exactly one write", which a split write defeats.
  const writeCounts = new Map<string, number>();
  const countWrite = (name: string) => writeCounts.set(name, (writeCounts.get(name) ?? 0) + 1);
  // A real Mongo read hands back a freshly-deserialized document, not a
  // reference into the driver's cache — mutating what a caller reads must
  // never be visible to a later read or to `dump()`. structuredClone matches
  // that on every path that hands a document back to a caller.
  const cloned = <T>(d: T): T => structuredClone(d);
  const consumeFailure = (flag: { code?: number } | null, reset: () => void): void => {
    if (!flag) return;
    reset();
    const err = new Error('Simulated error') as any;
    Object.assign(err, flag);
    throw err;
  };
  const db = {
    collection(name: string) {
      return {
        async createIndex() { return `${name}_idx`; },
        async countDocuments(filter: Doc = {}) {
          return rows(name).filter((d) => matches(d, filter)).length;
        },
        async findOne(filter: Doc) {
          consumeFailure(nextReadShouldFail, () => { nextReadShouldFail = null; });
          const d = rows(name).find((doc) => matches(doc, filter));
          return d ? cloned(d) : null;
        },
        async updateOne(filter: Doc, update: Doc, opts: Doc = {}) {
          countWrite(name);
          const armed = nextWriteFailure.get(name);
          if (armed) { nextWriteFailure.delete(name); throw armed; }
          consumeFailure(nextUpdateShouldFail, () => { nextUpdateShouldFail = null; });
          checkPathConflicts(update);
          const d = rows(name).find((r) => matches(r, filter));
          if (d) {
            apply(d, update, false);
            return { matchedCount: 1, modifiedCount: 1, upsertedId: null, acknowledged: true };
          }
          if (opts.upsert) {
            const created: Doc = { _id: filter._id ?? `id-${nextId++}`, ...equalityFields(filter) };
            apply(created, update, true);
            rows(name).push(created);
            return { matchedCount: 0, modifiedCount: 0, upsertedId: created._id, acknowledged: true };
          }
          return { matchedCount: 0, modifiedCount: 0, upsertedId: null, acknowledged: true };
        },
        async findOneAndUpdate(filter: Doc, update: Doc, opts: Doc = {}) {
          countWrite(name);
          const armed = nextWriteFailure.get(name);
          if (armed) { nextWriteFailure.delete(name); throw armed; }
          checkPathConflicts(update);
          let d = rows(name).find((r) => matches(r, filter));
          let upserted = false;
          if (!d && opts.upsert) {
            d = { _id: filter._id ?? `id-${nextId++}`, ...equalityFields(filter) };
            apply(d, update, true);
            rows(name).push(d);
            upserted = true;
          } else if (d) {
            apply(d, update, false);
          }
          const value = d ? cloned(d) : null;
          if (opts.includeResultMetadata) {
            return { value, ok: 1, lastErrorObject: { updatedExisting: !!d && !upserted, upserted: upserted ? d!._id : undefined } };
          }
          return value;
        },
        async insertOne(doc: Doc) {
          countWrite(name);
          const armed = nextWriteFailure.get(name);
          if (armed) { nextWriteFailure.delete(name); throw armed; }
          const d = { _id: `id-${nextId++}`, ...doc };
          rows(name).push(d);
          return { insertedId: d._id, acknowledged: true };
        },
        find(filter: Doc = {}) {
          let out = rows(name).filter((d) => matches(d, filter));
          const api = {
            sort(spec: Record<string, 1 | -1>) {
              const [[key, dir]] = Object.entries(spec);
              out = [...out].sort((a, b) => {
                const av = Number(a[key] instanceof Date ? (a[key] as Date).getTime() : a[key] ?? 0);
                const bv = Number(b[key] instanceof Date ? (b[key] as Date).getTime() : b[key] ?? 0);
                return dir === 1 ? av - bv : bv - av;
              });
              return api;
            },
            limit(n: number) { out = out.slice(0, n); return api; },
            async toArray() { return out.map(cloned); },
          };
          return api;
        },
        async deleteOne(filter: Doc) {
          countWrite(name);
          const armed = nextWriteFailure.get(name);
          if (armed) { nextWriteFailure.delete(name); throw armed; }
          // deletes are a write too: the same "next op fails" flag covers both
          consumeFailure(nextUpdateShouldFail, () => { nextUpdateShouldFail = null; });
          const list = rows(name);
          const i = list.findIndex((d) => matches(d, filter));
          if (i < 0) return { deletedCount: 0 };
          list.splice(i, 1);
          return { deletedCount: 1 };
        },
        async deleteMany(filter: Doc = {}) {
          countWrite(name);
          const armed = nextWriteFailure.get(name);
          if (armed) { nextWriteFailure.delete(name); throw armed; }
          const list = rows(name);
          const keep = list.filter((d) => !matches(d, filter));
          const deletedCount = list.length - keep.length;
          list.length = 0;
          list.push(...keep);
          return { deletedCount };
        },
      };
    },
    /** Arms the next write — updateOne, findOneAndUpdate, insertOne, deleteOne or
     *  deleteMany — on ONE collection to throw `err`. Scoped so a test can fail the
     *  write it is about and not whatever write happens to come first. */
    failNextWriteTo(collection: string, err: Error) { nextWriteFailure.set(collection, err); },
    /** How many writes have run on one collection so far — see writeCounts above. */
    writes(collection: string) { return writeCounts.get(collection) ?? 0; },
  };
  return {
    db: db as unknown as import('mongodb').Db & {
      failNextWriteTo: (collection: string, err: Error) => void;
      writes: (collection: string) => number;
    },
    dump: (name: string) => rows(name),
    failNextUpdateWith: (err: { code?: number }) => { nextUpdateShouldFail = err; },
    failNextReadWith: (err: { code?: number }) => { nextReadShouldFail = err; },
  };
}
