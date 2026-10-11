import { type InkDocument, type InkKey, type InkRecord, keyId } from './model';

export class InkConflict extends Error {
  constructor() { super('다른 탭에서 이 필기를 변경했습니다. 덮어쓰지 않았습니다. 복구 JSON을 내보낸 뒤 최신 필기를 불러오세요.'); }
}
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('bio-sprint-ink', 1);
    let failed = false;
    request.onupgradeneeded = () => request.result.createObjectStore('surfaces');
    request.onerror = () => { failed = true; reject(request.error); };
    request.onblocked = () => { failed = true; reject(new Error('필기 저장소 열기가 지연됩니다. 다른 탭을 닫고 재시도하세요.')); };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => { db.close(); connection = undefined; };
      db.onclose = () => { connection = undefined; };
      resolve(db);
    };
  });
  void connection.catch(() => { connection = undefined; });
  return connection;
}
export async function readInk(key: InkKey): Promise<InkRecord | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('surfaces'), request = tx.objectStore('surfaces').get(keyId(key));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('필기를 불러오지 못했습니다.'));
  });
}
export async function saveInk(key: InkKey, document: InkDocument, revision: number): Promise<InkRecord> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('surfaces', 'readwrite'), store = tx.objectStore('surfaces');
    const request = store.get(keyId(key));
    const record: InkRecord = { key, document, revision: revision + 1, updatedAt: Date.now() };
    let failure: unknown;
    request.onsuccess = () => {
      try {
        if ((request.result?.revision ?? 0) !== revision) throw new InkConflict();
        store.put(record, keyId(key));
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(record);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('필기 저장에 실패했습니다.'));
  });
}
