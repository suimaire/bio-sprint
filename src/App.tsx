import { useEffect, useRef, useState } from 'react';
import { Dashboard, ReviewList } from './Dashboard';
import { Analytics } from './Analytics';
import { QuestionBank } from './QuestionBank';
import { Training } from './Training';
import { ExamPlayer } from './Exam';
import { ExamReport } from './ExamReport';
import { downloadJSON, loadData, readRawData, saveData, type Snapshot } from './storage';
import { type StudyData } from './model';
import { go, Icon, Link, routePath } from './ui';

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [path, setPath] = useState(routePath);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const saving = useRef(false);
  const current = useRef<Snapshot | null>(null);
  const changes = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadData().then(value => { if (!cancelled) { current.current = value; setSnapshot(value); } }).catch(e => { if (!cancelled) { setError((e as Error).message); setFatal(true); } });
    const onRoute = () => setPath(routePath());
    async function refresh() {
      if (cancelled) return;
      setSyncing(true);
      try {
        const value = await loadData();
        if (cancelled) return;
        if (value.revision > (current.current?.revision ?? -1)) {
          const priorExam = current.current?.data.sessions.find(s => s.mode === 'REAL_EXAM' && s.status === 'ACTIVE');
          current.current = value; setSnapshot(value);
          if (priorExam && value.data.sessions.some(s => s.id === priorExam.id && s.status === 'COMPLETED')) go(`/session/${encodeURIComponent(priorExam.id)}`);
        }
        setSyncing(false);
      } catch (e) { if (!cancelled) setError(`최신 기록 확인 실패: ${(e as Error).message}`); }
    }
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    changes.current = new BroadcastChannel('bio-sprint-changes');
    changes.current.onmessage = onFocus;
    window.addEventListener('popstate', onRoute);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; changes.current?.close(); changes.current = null; window.removeEventListener('popstate', onRoute); window.removeEventListener('hashchange', onRoute); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  async function save(data: StudyData, expectedData = snapshot?.data) {
    if (!current.current || saving.current) return false;
    if (expectedData !== current.current.data) {
      setError('다른 탭에서 데이터가 변경되었습니다. 오래된 변경으로 덮어쓰지 않았습니다. 임시 기록이 있다면 내보낸 뒤 최신 기록에서 계속하세요.');
      return false;
    }
    saving.current = true; setBusy(true); setError('');
    try {
      const saved = await saveData(data, current.current.revision);
      current.current = saved; setSnapshot(saved); changes.current?.postMessage(saved.revision); return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  const nav = [ ['/', '대시보드', 'grid'], ['/training', '집중 훈련', 'timer'], ['/review', '우선순위 복습', 'review'], ['/question-bank', '문제 은행', 'bank'], ['/analytics', '누적 분석', 'grid'] ] as const;
  const data = snapshot?.data;
  const activeExam = data?.sessions.find(s => s.mode === 'REAL_EXAM' && s.status === 'ACTIVE');
  const pathname = path.split('?')[0];
  let routeSessionId = pathname.slice('/session/'.length);
  try { routeSessionId = decodeURIComponent(routeSessionId); } catch { /* An invalid URL simply has no matching session. */ }
  const reportSession = data?.sessions.find(s => s.id === routeSessionId && s.mode === 'REAL_EXAM');
  return <><a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById("main")?.focus(); document.getElementById("main")?.scrollIntoView(); }}>본문으로 건너뛰기</a>{!activeExam && <aside className="sidebar"><Link href="/" className="brand"><span className="brand-icon"><Icon name="leaf"/></span><span>BIO SPRINT<small>생물학 실전 트레이닝</small></span></Link><span className="sidebar-label">WORKSPACE</span><nav aria-label="주 메뉴">{nav.map(([href, label, icon]) => <Link key={href} href={href} className={`nav-link ${pathname === href ? 'active' : ''}`}><Icon name={icon}/><span>{label}</span>{href === '/training' && data?.sessions.some(s => s.status === 'ACTIVE') && <span className="active-dot" aria-label="진행 중"/>}</Link>)}</nav><div className="sidebar-bottom"><span className="local-label"><span/>LOCAL ONLY</span><p>빠르게 회상하고,<br/>정확하게 판단하세요.</p><small>v0.2 · 2026.11.14 시험</small></div></aside>}
    <div className={`workspace ${activeExam ? 'exam-workspace' : ''}`}><div className="topbar"><span>나의 학습 공간 <span className="slash">/</span> {activeExam ? 'REAL EXAM' : nav.find(n => n[0] === pathname)?.[1] ?? '훈련 결과'}</span><span className="save-indicator">{busy ? '저장 중…' : error ? '저장 상태 확인 필요' : syncing ? '최신 기록 확인 중…' : snapshot ? '● 이 기기에 저장됨' : '저장소 확인 중'}</span></div><main id="main" tabIndex={-1}>
      {error && <div className="storage-error"><pre role="alert" className="alert">{error}</pre><div className="button-row">{!activeExam && <button className="button secondary" onClick={() => location.reload()}>새로고침</button>}{fatal && <button className="button secondary" onClick={() => void readRawData().then(raw => downloadJSON(raw, 'bio-sprint-recovery.json')).catch(e => setError((e as Error).message))}>원본 데이터 내보내기</button>}</div>{fatal && <p className="small">기존 데이터는 초기화하지 않았습니다. 원본을 백업한 후 저장소 문제를 확인하세요.</p>}</div>}
      {!data && !fatal && <p className="empty">학습 기록을 불러오는 중입니다…</p>}
      {data && (activeExam ? <ExamPlayer key={activeExam.id} data={data} session={activeExam} onSave={save} busy={busy || syncing}/> : syncing ? <p className="empty">최신 기록을 확인하는 중입니다…</p> : pathname === '/' ? <Dashboard data={data} onSave={save} busy={busy}/> : pathname === '/training' ? <Training key={path} data={data} onSave={save} busy={busy}/> : pathname === '/question-bank' ? <QuestionBank data={data} onSave={save} busy={busy}/> : pathname === '/review' ? <><header className="page-heading"><div><span className="eyebrow">REVIEW QUEUE</span><h1>우선순위 복습</h1><p>최근 실수와 풀이 시간을 다음 훈련으로 연결합니다.</p></div></header><ReviewList data={data} full/></> : pathname === '/analytics' ? <Analytics data={data}/> : pathname.startsWith('/session/') ? <>{reportSession ? <ExamReport data={data} session={reportSession} onSave={save} busy={busy}/> : <Analytics data={data} sessionId={routeSessionId}/>}</> : <><h1>페이지를 찾을 수 없습니다</h1><Link href="/">대시보드로 이동</Link></>)}
      <footer className="page-footer"><span>BIO SPRINT</span><span>더 많은 정답, 더 나은 시간 판단.</span><span>PERSONAL STUDY TOOL · v0.2</span></footer>
    </main></div></>;
}
