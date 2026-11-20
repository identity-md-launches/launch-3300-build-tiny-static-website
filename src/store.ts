/**
 * The browser's IndexedDB, with an in-memory stand-in where it is missing (private windows that block it, tests).
 * Three stores: "scan" (the last block scanned and the requests found), "files" (page, lines, edit and artifact
 * files, by key) and "digests" (one small summary per subject for the home list, plus logos by hash).
 */
const DB_NAME = "imd-record";
const DB_VERSION = 1;
export const STORES = ["scan", "files", "digests"] as const;
export type StoreName = (typeof STORES)[number];

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  set(store: StoreName, key: string, value: unknown): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  all<T>(store: StoreName): Promise<T[]>;
}

/** A Map per store: what tests use, and what the site falls back to when IndexedDB cannot open. */
export function memoryKV(): KV {
  const maps = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
  return {
    async get<T>(store: StoreName, key: string) {
      return clone(maps.get(store)!.get(key) as T | undefined);
    },
    async set(store, key, value) {
      maps.get(store)!.set(key, clone(value));
    },
    async del(store, key) {
      maps.get(store)!.delete(key);
    },
    async all<T>(store: StoreName) {
      return [...maps.get(store)!.values()].map((v) => clone(v as T));
    },
  };
}

function idbKV(db: IDBDatabase): KV {
  const run = <T>(store: StoreName, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = f(tx.objectStore(store));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  return {
    get: (store, key) => run(store, "readonly", (s) => s.get(key)),
    set: (store, key, value) => run(store, "readwrite", (s) => s.put(value, key)),
    del: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
    all: (store) => run(store, "readonly", (s) => s.getAll()),
  };
}

function openIdb(): Promise<KV> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(memoryKV());
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(idbKV(req.result));
      req.onerror = () => resolve(memoryKV());
      req.onblocked = () => resolve(memoryKV());
    } catch {
      resolve(memoryKV());
    }
  });
}

let current: Promise<KV> | null = null;
/** The one store of this page. Tests swap in memoryKV() with useKV. */
export const kv = (): Promise<KV> => (current ??= openIdb());
export const useKV = (k: KV) => {
  current = Promise.resolve(k);
};

/** Never lets a storage failure break a read: a miss instead. */
export async function kvGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await (await kv()).get<T>(store, key);
  } catch {
    return undefined;
  }
}
export async function kvSet(store: StoreName, key: string, value: unknown): Promise<void> {
  try {
    await (await kv()).set(store, key, value);
  } catch {
    /* quota or blocked: render without it */
  }
}
export async function kvAll<T>(store: StoreName): Promise<T[]> {
  try {
    return await (await kv()).all<T>(store);
  } catch {
    return [];
  }
}

/** Page files used to live in localStorage (imd-record:v1:page:…, lines:, edit:, artifact:, logo:). Moved out once. */
export function dropOldFileCache(storage: Pick<Storage, "length" | "key" | "removeItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  if (!storage) return 0;
  const old: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && /^imd-record:v1:(page|lines|edit|artifact|logo):/.test(k)) old.push(k);
    }
    for (const k of old) storage.removeItem(k);
  } catch {
    /* blocked */
  }
  return old.length;
}
