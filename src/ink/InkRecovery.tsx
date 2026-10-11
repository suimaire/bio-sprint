import { useEffect, useState, useSyncExternalStore } from 'react';
import { exportQuestion } from './export';
import { surfaceLabels } from './model';
import { flushInk, inkRevision, inkStores, subscribeInk } from './store';
import { finishInkGestures } from './gestures';

export function InkRecovery() {
  useSyncExternalStore(subscribeInk, inkRevision);
  const [exported, setExported] = useState<Record<string, number>>({}), [error, setError] = useState('');
  useEffect(() => {
    const flush = () => { finishInkGestures(); flushInk(); };
    const unloading = (e: BeforeUnloadEvent) => { flush(); if (inkStores().some(s => s.dirty())) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', unloading);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', unloading); };
  }, []);
  const failed = inkStores().filter(s => ['error', 'conflict'].includes(s.snapshot().status));
  return <>{failed.map(store => {
    const state = store.snapshot(), id = JSON.stringify(store.key);
    return <section key={id} className="alert ink-recovery" role="alert"><strong>{state.loaded ? '필기 저장 실패' : '필기 불러오기 실패'} · {store.key.questionId} · {surfaceLabels[store.key.surface]}</strong><p>{state.error}</p><p>이 탭의 필기는 임시 보관 중입니다. 새로고침하거나 창을 닫기 전에 내보내세요.</p>
      <div className="ink-actions button-row"><button className="button secondary" onClick={() => void exportQuestion(store.key).then(() => { setExported(v => ({ ...v, [id]: inkRevision() })); setError(''); }).catch(e => setError(String(e)))}>복구 필기 JSON 내보내기</button>
        {state.status !== 'conflict' ? <button className="button secondary" onClick={() => void store.retry()}>필기 저장 재시도</button> : <button className="button secondary" disabled={!exported[id]} onClick={() => { if (window.confirm('복구 JSON 다운로드를 확인했나요? 이 영역의 임시 필기를 버리고 다른 탭에서 저장한 최신 필기를 불러옵니다.')) void store.reload(); }}>최신 필기 불러오기</button>}
      </div></section>;
  })}{error && <p className="alert" role="alert">{error}</p>}</>;
}
