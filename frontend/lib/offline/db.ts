'use client';
/**
 * offline/db.ts
 *
 * IndexedDB wrapper that serves as the offline-first local database.
 * Replaces direct localStorage usage for structured data.
 *
 * Stores:
 *   - patients         : CachedPatient rows
 *   - appointments     : appointment rows (real + optimistic)
 *   - consultationNotes: doctor notes keyed by patientId+consultationId
 *   - syncQueue        : pending mutations to replay on reconnection
 *   - syncMeta         : per-collection last-synced timestamps
 */

export const DB_NAME = 'orthoclinic_offline_v1';
export const DB_VERSION = 1;

export type SyncQueueOp = 'create' | 'update' | 'delete';
export type SyncQueueEntity = 'appointment' | 'consultationNote' | 'patient';

export interface SyncQueueItem {
  id: string;                   // local UUID
  entity: SyncQueueEntity;
  op: SyncQueueOp;
  localId: string;              // local record id
  serverId?: number;            // filled once server has accepted
  payload: any;
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
  attempts: number;
  lastAttempt?: number;         // ms timestamp
  nextRetry?: number;           // ms timestamp (exponential backoff)
  errorMessage?: string;
  conflictData?: any;           // server version on conflict
  createdAt: number;
}

export interface LocalAppointment {
  localId: string;
  serverId?: number;
  optimistic: boolean;          // true = not yet confirmed by server
  status: 'agendado' | 'confirmado' | 'cancelado' | 'realizado';
  clinic_id: number;
  date: string;
  start_time?: string;
  patient_name: string;
  patient_phone?: string;
  patient_id?: number;
  reason?: string;
  appointment_type?: string;
  notes?: string;
  updatedAt: number;
  serverUpdatedAt?: string;     // ISO from server — used for conflict detection
}

export interface LocalConsultationNote {
  localId: string;
  serverId?: number;
  patientId: number;
  consultationId: number;
  content: string;
  updatedAt: number;
  serverUpdatedAt?: string;
  synced: boolean;
}

// ── Open / upgrade ────────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // patients
      if (!db.objectStoreNames.contains('patients')) {
        const ps = db.createObjectStore('patients', { keyPath: 'id' });
        ps.createIndex('cachedAt', 'cachedAt', { unique: false });
      }

      // appointments
      if (!db.objectStoreNames.contains('appointments')) {
        const as = db.createObjectStore('appointments', { keyPath: 'localId' });
        as.createIndex('serverId', 'serverId', { unique: false });
        as.createIndex('date', 'date', { unique: false });
        as.createIndex('clinic_id', 'clinic_id', { unique: false });
      }

      // consultationNotes
      if (!db.objectStoreNames.contains('consultationNotes')) {
        const ns = db.createObjectStore('consultationNotes', { keyPath: 'localId' });
        ns.createIndex('patientId', 'patientId', { unique: false });
        ns.createIndex('consultationId', 'consultationId', { unique: false });
      }

      // syncQueue
      if (!db.objectStoreNames.contains('syncQueue')) {
        const sq = db.createObjectStore('syncQueue', { keyPath: 'id' });
        sq.createIndex('status', 'status', { unique: false });
        sq.createIndex('entity', 'entity', { unique: false });
        sq.createIndex('nextRetry', 'nextRetry', { unique: false });
      }

      // syncMeta
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return _dbPromise;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

export async function dbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll<T>(store: string, indexName?: string, query?: IDBKeyRange): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const req = indexName ? os.index(indexName).getAll(query) : os.getAll(query);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbPutMany<T>(store: string, values: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    let pending = values.length;
    if (pending === 0) { resolve(); return; }
    for (const v of values) {
      const req = os.put(v);
      req.onsuccess = () => { pending--; if (pending === 0) resolve(); };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function dbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbCount(store: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── SyncMeta helpers ─────────────────────────────────────────────────────────

export async function getLastSync(collection: string): Promise<number> {
  const row = await dbGet<{ key: string; ts: number }>('syncMeta', collection);
  return row?.ts ?? 0;
}

export async function setLastSync(collection: string, ts: number): Promise<void> {
  await dbPut('syncMeta', { key: collection, ts });
}
