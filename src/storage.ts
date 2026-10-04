import { type StudyData } from './model';
import { seedQuestions } from './seed';
import { validateStudyData } from './validation';

export interface Snapshot { revision: number; data: StudyData }
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('bio-sprint', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('study');
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error('다른 탭을 닫고 다시 열어 주세요. 저장소 업데이트가 대기 중입니다.')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
  });
  return connection;
}
export async function readRawData(): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('study', 'readonly').objectStore('study').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadData(): Promise<Snapshot> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('study', 'readwrite');
    const store = tx.objectStore('study');
    const request = store.get('current');
    let snapshot: Snapshot;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        if (request.result === undefined) {
          snapshot = { revision: 0, data: { schemaVersion: 1, questions: seedQuestions, sessions: [], responses: [] } };
          validateStudyData(snapshot.data);
          store.add(snapshot, 'current');
        } else {
          snapshot = request.result;
          if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error('저장소 revision이 올바르지 않습니다.');
          validateStudyData(snapshot.data);
        }
      } catch (e) { failure = e; tx.abort(); }
    };
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('저장소를 열 수 없습니다.'));
  });
}
export async function saveData(data: StudyData, expectedRevision: number): Promise<Snapshot> {
  validateStudyData(data);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('study', 'readwrite');
    const store = tx.objectStore('study');
    const request = store.get('current');
    const snapshot = { revision: expectedRevision + 1, data };
    let failure: Error | undefined;
    request.onsuccess = () => {
      if (request.result?.revision !== expectedRevision) {
        failure = new Error('다른 탭에서 데이터가 변경되었습니다. 이 변경은 저장하지 않았습니다. 새로고침 후 다시 시도해 주세요.');
        tx.abort(); return;
      }
      store.put(snapshot, 'current');
    };
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('저장 실패: 브라우저의 저장 공간과 권한을 확인해 주세요.'));
  });
}
export function downloadJSON(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
