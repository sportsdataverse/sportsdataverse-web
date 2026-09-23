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

function matches(doc: Doc, filter: Doc) {
  return Object.entries(filter).every(([k, v]) => String(doc[k]) === String(v));
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
  const db = {
    collection(name: string) {
      return {
        async createIndex() { return `${name}_idx`; },
        async findOne(filter: Doc) { return rows(name).find((d) => matches(d, filter)) ?? null; },
        async updateOne(filter: Doc, update: Doc) {
          const d = rows(name).find((r) => matches(r, filter));
          if (d) apply(d, update, false);
          return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 };
        },
        async findOneAndUpdate(filter: Doc, update: Doc, opts: Doc = {}) {
          let d = rows(name).find((r) => matches(r, filter));
          let upserted = false;
          if (!d && opts.upsert) {
            d = { _id: filter._id ?? `id-${nextId++}`, ...filter };
            apply(d, update, true);
            rows(name).push(d);
            upserted = true;
          } else if (d) {
            apply(d, update, false);
          }
          if (opts.includeResultMetadata) {
            return { value: d ?? null, ok: 1, lastErrorObject: { updatedExisting: !!d && !upserted, upserted: upserted ? d!._id : undefined } };
          }
          return d ?? null;
        },
        async insertOne(doc: Doc) {
          const d = { _id: `id-${nextId++}`, ...doc };
          rows(name).push(d);
          return { insertedId: d._id, acknowledged: true };
        },
      };
    },
  };
  return { db: db as unknown as import('mongodb').Db, dump: (name: string) => rows(name) };
}
