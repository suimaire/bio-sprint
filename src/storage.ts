import { type StudyData } from './model';
import { seedQuestions } from './seed';
import { validateStudyData } from './validation';

export interface QFCancellation { sessionId: string; pending: boolean }
export interface Snapshot { revision: number; data: StudyData; qfCancellations?: QFCancellation[] }
const cancellationKey = 'qf-cancellations';
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
    const cancellations = store.get(cancellationKey);
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
      } catch (e) { failure = e; try { tx.abort(); } catch { /* The transaction may already have aborted. */ } }
    };
    tx.oncomplete = () => resolve({ ...snapshot, qfCancellations: cancellations.result ?? [] });
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
    const cancellations = store.get(cancellationKey);
    const snapshot = { revision: expectedRevision + 1, data };
    let failure: Error | undefined;
    cancellations.onsuccess = () => {
      if (request.result?.revision !== expectedRevision) {
        failure = new Error('다른 탭에서 데이터가 변경되었습니다. 이 변경은 저장하지 않았습니다. 새로고침 후 다시 시도해 주세요.');
        tx.abort(); return;
      }
      const markers: QFCancellation[] = cancellations.result ?? [];
      if (markers.some(m => m.pending || data.qfSessions?.some(s => s.id === m.sessionId) || data.qfResponses?.some(r => r.sessionId === m.sessionId))) {
        failure = new Error('취소한 훈련은 다시 저장할 수 없습니다. 삭제가 진행 중이라면 삭제 재시도를 완료해 주세요.');
        tx.abort(); return;
      }
      store.put(snapshot, 'current');
    };
    tx.oncomplete = () => resolve({ ...snapshot, qfCancellations: cancellations.result ?? [] });
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('저장 실패: 브라우저의 저장 공간과 권한을 확인해 주세요.'));
  });
}
// The intent and study deletion commit together. Keep a minimal ID-only
// tombstone after completion so stale tabs/backups cannot resurrect a session.
export async function beginQFCancellation(sessionId: string, expectedRevision: number): Promise<Snapshot> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('study', 'readwrite'), store = tx.objectStore('study');
    const current = store.get('current'), markers = store.get(cancellationKey);
    let result: Snapshot, failure: unknown;
    markers.onsuccess = () => {
      try {
        const snapshot = current.result as Snapshot;
        const cancellations: QFCancellation[] = markers.result ?? [];
        if (cancellations.some(m => m.sessionId === sessionId)) { result = { ...snapshot, qfCancellations: cancellations }; return; }
        if (snapshot.revision !== expectedRevision) throw new Error('다른 탭에서 데이터가 변경되었습니다. 최신 기록을 확인한 뒤 훈련 취소를 다시 실행해 주세요.');
        const session = snapshot.data.qfSessions?.find(s => s.id === sessionId);
        if (!session || session.status === 'COMPLETED') throw new Error('진행 중이거나 일시정지한 훈련만 취소할 수 있습니다.');
        const data: StudyData = { ...snapshot.data, qfSessions: snapshot.data.qfSessions!.filter(s => s.id !== sessionId), qfResponses: snapshot.data.qfResponses!.filter(r => r.sessionId !== sessionId) };
        validateStudyData(data);
        const next = { revision: snapshot.revision + 1, data };
        const nextMarkers = [...cancellations, { sessionId, pending: true }];
        store.put(nextMarkers, cancellationKey); store.put(next, 'current');
        result = { ...next, qfCancellations: nextMarkers };
      } catch (e) { failure = e; try { tx.abort(); } catch { /* The transaction may already have aborted. */ } }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('훈련 취소 기록을 저장하지 못했습니다. 다시 시도해 주세요.'));
  });
}
export async function completeQFCancellation(sessionId: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('study', 'readwrite'), store = tx.objectStore('study');
    const current = store.get('current'), markers = store.get(cancellationKey);
    let failure: unknown;
    markers.onsuccess = () => {
      const data: StudyData = current.result.data;
      if (data.qfSessions?.some(s => s.id === sessionId) || data.qfResponses?.some(r => r.sessionId === sessionId)) {
        failure = new Error('취소한 훈련의 삭제 확인에 실패했습니다.'); tx.abort(); return;
      }
      store.put((markers.result as QFCancellation[]).map(m => m.sessionId === sessionId ? { ...m, pending: false } : m), cancellationKey);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('훈련 삭제 완료를 확인하지 못했습니다. 다시 시도해 주세요.'));
  });
}
export function downloadJSON(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
