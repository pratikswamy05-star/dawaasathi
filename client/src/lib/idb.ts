/** Tiny IndexedDB key-value wrapper (no dependency). Two stores: cached API responses and the offline sync queue. */
const DB = 'dawaasathi';
type Store = 'cache' | 'queue';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('cache');
        req.result.createObjectStore('queue');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const idbGet = <T>(store: Store, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const idbSet = (store: Store, key: string, value: unknown) => run<void>(store, 'readwrite', (s) => s.put(value, key));
export const idbDel = (store: Store, key: string) => run<void>(store, 'readwrite', (s) => s.delete(key));
export const idbAll = <T>(store: Store) => run<T[]>(store, 'readonly', (s) => s.getAll());
export const idbKeys = (store: Store) => run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());
