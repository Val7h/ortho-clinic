/**
 * Cache offline de documentos usando IndexedDB.
 *
 * Estratégia:
 *  - Ao abrir um documento, o blob é persistido no IndexedDB.
 *  - Na abertura seguinte, se o dispositivo estiver offline,
 *    o blob cacheado é servido diretamente.
 *  - Limite configurável (padrão 100 MB total).
 *  - Entradas expiram após 7 dias por padrão.
 */

const DB_NAME = "orthoclinic_docs";
const STORE = "documents";
const DB_VERSION = 1;
const MAX_CACHE_BYTES = 100 * 1024 * 1024; // 100 MB
const TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 dias

interface CachedDoc {
  key: string;          // `doc_${patientId}_${docId}`
  blob: Blob;
  mimeType: string;
  fileName: string;
  cachedAt: number;     // Date.now()
  sizeBytes: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CachedDoc | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entry: CachedDoc): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<CachedDoc[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Evicta entradas antigas até ficar abaixo de MAX_CACHE_BYTES. */
async function evictIfNeeded(db: IDBDatabase): Promise<void> {
  const all = await idbGetAll(db);
  const total = all.reduce((s, e) => s + e.sizeBytes, 0);
  if (total <= MAX_CACHE_BYTES) return;

  // Remove as mais antigas primeiro
  const sorted = [...all].sort((a, b) => a.cachedAt - b.cachedAt);
  let freed = 0;
  const target = total - MAX_CACHE_BYTES;
  for (const entry of sorted) {
    await idbDelete(db, entry.key);
    freed += entry.sizeBytes;
    if (freed >= target) break;
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function cacheDocument(
  patientId: number,
  docId: number,
  blob: Blob,
  mimeType: string,
  fileName: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  await evictIfNeeded(db);
  const key = `doc_${patientId}_${docId}`;
  const entry: CachedDoc = {
    key,
    blob,
    mimeType,
    fileName,
    cachedAt: Date.now(),
    sizeBytes: blob.size,
  };
  await idbPut(db, entry);
}

export async function getCachedDocument(
  patientId: number,
  docId: number,
): Promise<{ blob: Blob; mimeType: string; fileName: string } | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDB();
  const key = `doc_${patientId}_${docId}`;
  const entry = await idbGet(db, key);
  if (!entry) return null;
  // Verifica TTL
  if (Date.now() - entry.cachedAt > TTL_MS) {
    await idbDelete(db, key);
    return null;
  }
  return { blob: entry.blob, mimeType: entry.mimeType, fileName: entry.fileName };
}

export async function removeCachedDocument(
  patientId: number,
  docId: number,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  await idbDelete(db, `doc_${patientId}_${docId}`);
}

export async function isCached(patientId: number, docId: number): Promise<boolean> {
  const result = await getCachedDocument(patientId, docId);
  return result !== null;
}

export async function clearAllCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  const all = await idbGetAll(db);
  for (const entry of all) {
    await idbDelete(db, entry.key);
  }
}
