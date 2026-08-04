/* =========================================================
   db.js — 작품 보관함 (IndexedDB)
   그림·노래·영상은 용량이 크므로 localStorage 대신 IndexedDB에 Blob으로 저장합니다.
   모두 이 기기의 브라우저 안에만 저장되며 서버로 보내지 않습니다.
   ========================================================= */

const DB = (() => {
  const NAME = 'story-gallery';
  const STORE = 'works';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('이 브라우저는 보관함을 지원하지 않아요.')); return; }
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode) {
    return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
  }

  /* work = { mode, title, story, createdAt, blobs:[Blob], thumb:Blob|null, texts:[문장] } */
  function add(work) {
    return tx('readwrite').then(os => new Promise((resolve, reject) => {
      const req = os.add(work);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function list() {
    return tx('readonly').then(os => new Promise((resolve, reject) => {
      const req = os.getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    }));
  }

  function remove(id) {
    return tx('readwrite').then(os => new Promise((resolve, reject) => {
      const req = os.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  function clear() {
    return tx('readwrite').then(os => new Promise((resolve, reject) => {
      const req = os.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  return { add, list, remove, clear };
})();
