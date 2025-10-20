// Lightweight native IndexedDB helper for vin-chef (no external deps)

const DB_NAME = 'vin-chef-browser-db';
const DB_VERSION = 3;
const STORE_NAMES = ['products', 'clients', 'sales', 'invoices', 'users', 'categories', 'invoice_counter', 'stock_movements'];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      for (const s of STORE_NAMES) {
        if (!db.objectStoreNames.contains(s)) {
          if (s === 'invoice_counter') {
            const store = db.createObjectStore(s, { keyPath: 'id' });
            // ensure initial counter row
            // can't insert here synchronously; insertion will be done after open
          } else {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function ensureInvoiceCounter(db: IDBDatabase) {
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction('invoice_counter', 'readwrite');
      const store = tx.objectStore('invoice_counter');
      const getReq = store.get(1);
      getReq.onsuccess = () => {
        if (!getReq.result) store.put({ id: 1, counter: 0 });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return await new Promise<T[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

export async function idbGet<T>(storeName: string, key: string | number) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return undefined;
  }
}

export async function idbPut<T extends { id: string }>(storeName: string, item: T) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return await new Promise<void>((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return;
  }
}

export async function idbDelete(storeName: string, key: string | number) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return await new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return;
  }
}

export async function idbResetDemoData(initializeDemoData: (force?: boolean) => void) {
  try {
    const db = await openDB();
    // wipe stores
    for (const s of STORE_NAMES) {
      try {
        const tx = db.transaction(s, 'readwrite');
        const store = tx.objectStore(s);
        store.clear();
      } catch (e) {
        // ignore
      }
    }
    await ensureInvoiceCounter(db);
  } catch (e) {
    // ignore
  }
  // Use storage initializer to put demo data back in localStorage and let db.ts fall back if needed
  initializeDemoData(true);
}

export async function idbGetNextInvoiceNumber(): Promise<string> {
  try {
    const db = await openDB();
    await ensureInvoiceCounter(db);
    return await new Promise<string>((resolve) => {
      const tx = db.transaction('invoice_counter', 'readwrite');
      const store = tx.objectStore('invoice_counter');
      const getReq = store.get(1);
      getReq.onsuccess = () => {
        const row = getReq.result || { id: 1, counter: 0 };
        const next = row.counter + 1;
        store.put({ id: 1, counter: next });
        const num = `FAC-${new Date().getFullYear()}-${String(next).padStart(5, '0')}`;
        tx.oncomplete = () => resolve(num);
      };
      getReq.onerror = () => resolve(`FAC-${new Date().getFullYear()}-00001`);
    });
  } catch (e) {
    return `FAC-${new Date().getFullYear()}-00001`;
  }
}
