import { useRef, useState } from 'react';
import { DEFAULT_QF_SERVER, QF_SERVER_KEY, normalizeServerURL, listReadySets, downloadReadySet, type ReadySet } from './qfApi';
import type { QFPackage } from './qfModel';

export function QFConnection({ busy, imported, onPackage }: { busy: boolean; imported: string[]; onPackage: (pkg: QFPackage) => void }) {
  const [address, setAddress] = useState(() => {
    try { return localStorage.getItem(QF_SERVER_KEY) || DEFAULT_QF_SERVER; } catch { return DEFAULT_QF_SERVER; }
  });
  const [sets, setSets] = useState<ReadySet[]>([]);
  const [source, setSource] = useState('');
  const [state, setState] = useState('아직 연결을 확인하지 않았습니다.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  async function check() {
    if (inFlight.current || busy) return;
    inFlight.current = true; setLoading(true); setError(''); setSets([]); setSource('');
    setState('Mac mini 연결과 READY 세트를 확인하는 중…');
    try {
      const server = normalizeServerURL(address);
      try { localStorage.setItem(QF_SERVER_KEY, server); } catch { throw new Error('서버 주소를 이 브라우저에 저장하지 못했습니다. 사이트 저장 권한을 확인하세요.'); }
      setAddress(server);
      const entries = await listReadySets(server);
      setSets(entries); setSource(server); setState('연결됨 · 사용 가능한 READY 세트 ' + entries.length + '개');
    } catch (e) { setError((e as Error).message); setState('연결 확인 실패'); }
    finally { setLoading(false); inFlight.current = false; }
  }
  async function preview(entry: ReadySet) {
    if (inFlight.current || busy || !source) return;
    inFlight.current = true; setLoading(true); setError(''); setState('세트를 내려받아 검증하는 중…');
    try {
      onPackage(await downloadReadySet(source, entry.run_id, entry.sha256));
      setState('연결됨 · 다운로드 및 READY 검증 완료');
    } catch (e) { setError((e as Error).message); setState('세트 가져오기 실패'); }
    finally { setLoading(false); inFlight.current = false; }
  }
  return <section className="panel qf-connection" aria-label="Mac mini 연결">
    <div className="section-heading"><h2>Mac mini에서 가져오기</h2><span className="badge">읽기 전용</span></div>
    <p aria-live="polite" className="qf-connection-state">{state}</p>
    <label className="qf-server-label">Mac mini 서버 주소<input type="url" value={address} spellCheck={false} autoCapitalize="none" disabled={loading || busy} onChange={e => { setAddress(e.target.value); setSets([]); setSource(''); setError(''); setState('주소가 변경되었습니다. 연결을 다시 확인하세요.'); }} placeholder="http://127.0.0.1:8765"/></label>
    <div className="button-row"><button className="button primary" disabled={loading || busy} onClick={() => void check()}>{loading ? '연결 처리 중…' : '새 세트 불러오기'}</button></div>
    <p className="small muted">주소는 이 브라우저에만 저장됩니다. Mac mini 연결 없이도 이미 가져온 세트는 아래에서 시작할 수 있습니다.</p>
    {error && <p className="alert" role="alert">{error}</p>}
    {source && !sets.length && <p className="empty">전체 READY 검증을 통과한 DAILY-15 세트가 없습니다.</p>}
    {!!sets.length && <ul className="qf-ready-list" aria-label="사용 가능한 READY 세트">{sets.map(entry => <li key={entry.run_id}>
      <strong>{entry.run_id}</strong>
      <p>{entry.question_count}문항 · 30분 · AI_REVIEWED{imported.includes(entry.run_id) ? ' · 이 기기에 저장됨' : ''}</p>
      <p className="small muted">생성: {entry.created_at ? new Date(entry.created_at).toLocaleString('ko-KR') : '기록 없음'}{entry.generation.model ? ' · 모델 ' + entry.generation.model : ''}</p>
      <button className="button secondary" disabled={loading || busy} onClick={() => void preview(entry)}>가져오기 미리보기</button>
    </li>)}</ul>}
  </section>;
}
