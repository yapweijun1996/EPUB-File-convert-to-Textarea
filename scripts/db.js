const DB_NAME = 'epub-admin-converter-db';
const DB_VERSION = 1;
const STORE_NAME = 'conversionHistory';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('fileName', 'fileName', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(storeMode, callback) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, storeMode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  }));
}

export async function addHistory(record) {
  return transaction('readwrite', (store) => {
    store.add({
      ...record,
      createdAt: new Date().toISOString()
    });
  });
}

export async function listHistory(limit = 20) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const items = [];
    const request = index.openCursor(null, 'prev');

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || items.length >= limit) {
        resolve(items);
        db.close();
        return;
      }
      items.push(cursor.value);
      cursor.continue();
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function clearHistory() {
  return transaction('readwrite', (store) => store.clear());
}

export async function deleteHistory(id) {
  return transaction('readwrite', (store) => store.delete(Number(id)));
}
