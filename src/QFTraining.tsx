import { useEffect, useRef, useState } from 'react';
import { type StudyData } from './model';
import { hasQFAnswer, isChoice, type QFQuestion, type QFSession } from './qfModel';
import { actQF, startQF, type QFAction } from './qfEngine';
import { clockText, go, Link, type Save } from './ui';
import { DataTransfer } from './DataTransfer';
import { downloadJSON } from './storage';

export function QFSetup({ data, onSave, busy }: { data: StudyData; onSave: Save; busy: boolean }) {
  const [error, setError] = useState('');
  const active = data.sessions.some(s => s.status === 'ACTIVE') || data.qfSessions?.some(s => s.status === 'ACTIVE');
  async function start(runId: string) {
    try {
      // getRandomValues is also available in iPad HTTP LAN previews.
      const id = 'qf-session-' + Date.now() + '-' + Array.from(crypto.getRandomValues(new Uint32Array(2)), v => v.toString(16)).join('');
      await onSave(startQF(data, runId, Date.now(), id));
    } catch (e) { setError((e as Error).message); }
  }
  return <><header className="page-heading"><div><span className="eyebrow">QUESTION FACTORY</span><h1>DAILY-15 세트 훈련</h1><p>15문항 · 기본 30분 · q01–q15 순서 · 자유 이동과 자동 저장</p></div></header>
    <DataTransfer data={data} onSave={onSave} qf busy={busy}/>
    <p className="small muted">AI_REVIEWED는 AI 검토 상태입니다. 사람의 검증을 뜻하는 VERIFIED / REVIEWED와 별개입니다.</p>
    {active && <p className="alert">진행 중인 훈련을 먼저 완료해 주세요. <Link href="/training">훈련 이어하기</Link></p>}
    {(data.qfPackages ?? []).map(p => <section className="panel" key={p.run_id}>
      <div className="section-heading"><h2>{p.preset === 'daily15' ? 'DAILY-15' : p.preset === 'standard50' ? 'STANDARD-50' : p.preset.toUpperCase()}</h2><span className="badge qf-review-badge">AI_REVIEWED</span></div>
      <p className="small qf-preserve">{p.run_id}</p><p>{p.questions.length}문항 · {Object.entries(p.format_counts).map(([k,v]) => k + ' ' + v).join(' · ')}</p>
      {p.preset === 'daily15' ? <><p>제출 또는 30분 종료 후 정답·해설·채점 기준과 영어 검토를 확인합니다.</p><button className="button primary large" disabled={busy || !!active} onClick={() => void start(p.run_id)}>DAILY-15 시작 · 30분</button></> : <p className="alert">{p.preset === 'standard50' ? 'STANDARD-50은 QF 권장 시간 수정 전까지 실행하지 않습니다. 원본 패키지는 보관됩니다.' : '이번 단계에서는 DAILY-15만 실행합니다. 원본 패키지는 보관됩니다.'}</p>}
    </section>)}
    {!data.qfPackages?.length && <p className="empty">QF export JSON을 선택하면 세트가 여기에 표시됩니다.</p>}
    {error && <p className="alert" role="alert">{error}</p>}
  </>;
}
export function QFPrompt({ q }: { q: QFQuestion }) {
  return <><p className="small muted">Stage {q.stage} · {q.level} · {q.macro_domain} · {q.topic}<br/>지식 깊이 {q.knowledge_depth} · 추론 부담 {q.reasoning_load} · 언어 부담 {q.language_load}</p>
    <div className="tags"><span className="badge">{q.format}</span><span className="badge qf-review-badge">AI_REVIEWED</span>{q.hypothetical_context && <span className="badge">학습용 가정</span>}{q.synthetic_data && <span className="badge">합성 자료</span>}</div>
    <h2 id="qf-question-heading" tabIndex={-1} className="question-text">{q.stem}</h2>
    {q.format === 'COMBINATION' && <dl className="qf-statements">{Object.entries(q.statements!).map(([key, statement]) => <div key={key}><dt>{key}</dt><dd>{statement}</dd></div>)}</dl>}
  </>;
}
export function QFPlayer({ data, session, onSave, busy, recoveryRef }: { data: StudyData; session: QFSession; onSave: Save; busy: boolean; recoveryRef: { current: (() => StudyData | null) | null } }) {
  const [draft, setDraft] = useState(data);
  const working = useRef(data), saved = useRef(data), saving = useRef(false);
  useEffect(() => {
    recoveryRef.current = () => working.current === saved.current ? null : working.current;
    return () => { recoveryRef.current = null; };
  }, [recoveryRef]);
  const saver = useRef(onSave); saver.current = onSave;
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const failed = useRef(false), [now, setNow] = useState(Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const s = draft.qfSessions!.find(s => s.id === session.id)!;
  const p = draft.qfPackages!.find(p => p.run_id === s.runId)!;
  const qid = s.questionIds[s.cursor], q = p.questions.find(w => w.id === qid)!.question;
  const rows = draft.qfResponses!.filter(r => r.sessionId === s.id), r = rows.find(r => r.questionId === qid)!;
  const remaining = Math.max(0, s.startedAt + 1800000 - Math.max(now, s.lastEventAt));
  const locked = failed.current || s.status !== 'ACTIVE' || !remaining;
  useEffect(() => { document.getElementById('qf-question-heading')?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [qid]);
  useEffect(() => {
    // Adopt external tab updates only when there are no unsaved local edits.
    if (!saving.current && working.current === saved.current) { working.current = data; saved.current = data; setDraft(data); }
  }, [data]);
  async function flush() {
    if (saving.current || failed.current) return;
    saving.current = true; setPending(true);
    try {
      while (working.current !== saved.current) {
        const target = working.current, base = saved.current;
        if (!await saver.current(target, base)) throw new Error('저장하지 못했습니다. 현재 입력은 임시 보관 중입니다. 저장 재시도 또는 임시 기록 내보내기를 사용하세요.');
        saved.current = target;
      }
      setError('');
      if (saved.current.qfSessions!.find(s => s.id === session.id)!.status === 'COMPLETED') go('/qf-session/' + encodeURIComponent(session.id));
    } catch (e) { failed.current = true; setError((e as Error).message); }
    finally { saving.current = false; setPending(working.current !== saved.current); }
  }
  function dispatch(action: QFAction) {
    if (failed.current) return;
    try {
      const next = actQF(working.current, session.id, action, Date.now());
      if (next === working.current) return;
      working.current = next; setDraft(next); void flush();
    } catch (e) { setError((e as Error).message); }
  }
  function retry() {
    failed.current = false;
    const active = working.current.qfSessions!.find(s => s.id === session.id)!;
    if (active.status === 'ACTIVE') working.current = actQF(working.current, session.id, { type: 'expire' }, Date.now());
    setDraft(working.current); void flush();
  }
  useEffect(() => {
    const wake = () => setNow(Date.now());
    const timer = setInterval(wake, 250);
    window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake);
    const unloading = (e: BeforeUnloadEvent) => { if (working.current !== saved.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unloading);
    return () => { clearInterval(timer); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); window.removeEventListener('beforeunload', unloading); };
  }, []);
  useEffect(() => { if (!remaining && s.status === 'ACTIVE' && !failed.current) dispatch({ type: 'expire' }); });
  const navigate = (index: number) => { setConfirmEnd(false); dispatch({ type: 'navigate', index }); };
  return <div className="exam-player qf-player">
    <header className="exam-toolbar"><div><span className="eyebrow">QUESTION FACTORY · DAILY-15</span><h1>세트 훈련 <span>{s.cursor + 1} / 15</span></h1><span className="small muted" role="status">{pending ? '답안 저장 중…' : '답안 저장됨'} · 답변 {rows.filter(hasQFAnswer).length}/15</span></div><div className={`session-countdown ${remaining < 60000 ? 'urgent' : ''}`}><span>남은 시간</span><strong role="timer" aria-label="DAILY-15 남은 시간">{clockText(remaining)}</strong></div>
      <div className="qf-movement button-row"><button className="button secondary" disabled={locked || s.cursor === 0} onClick={() => navigate(s.cursor - 1)}>이전 문항</button><button className="button primary" disabled={locked || s.cursor === 14} onClick={() => navigate(s.cursor + 1)}>다음 문항</button><button className="button secondary" disabled={locked} onClick={() => dispatch({ type: 'triage', value: 'LATER' })}>Later · 나중에</button><button className="button secondary" disabled={locked} onClick={() => dispatch({ type: 'triage', value: 'SKIP' })}>Skip · 건너뛰기</button></div>
    </header>
    <div className="exam-layout"><section className="question-stage exam-question" aria-label="QF 풀이 문항">
      <QFPrompt q={q}/>
      <p className="small muted">Later/Skip은 답안을 유지하고 다음 문항으로 이동합니다.{r.triage && <> 현재 표시: {r.triage === 'LATER' ? 'Later' : 'Skip'} <button className="text-button" disabled={locked} onClick={() => dispatch({ type: 'triage', value: null })}>표시 해제</button></>}</p>
      {isChoice(q) ? <div className="choices" role="group" aria-labelledby="qf-question-heading">{Object.entries(q.options!).map(([key, value]) => <button key={key} data-choice="true" className={`choice ${r.selectedOption === key ? 'selected' : ''}`} disabled={locked} aria-pressed={r.selectedOption === key} onClick={() => dispatch({ type: 'choice', value: key })}><span className="choice-number">{key}</span><span>{Array.isArray(value) ? value.join(', ') : value}</span></button>)}<button className="text-button" disabled={locked || r.selectedOption === null} onClick={() => dispatch({ type: 'choice', value: null })}>답안 지우기</button></div> :
        <label className="qf-answer-label">{q.format === 'SHORT' ? '단답형 답안' : '서술형 답안'}<textarea key={qid} aria-label={q.format === 'SHORT' ? '단답형 답안' : '서술형 답안'} rows={q.format === 'SHORT' ? 3 : 8} value={r.textAnswer} maxLength={100000} disabled={locked} onChange={e => dispatch({ type: 'text', value: e.target.value })}/><span className="small muted">입력 즉시 자동 저장됩니다. 세트 제출 전까지 수정할 수 있습니다.</span></label>}
      <fieldset className="qf-confidence"><legend>확신도</legend><div className="confidence-row"><span className="small muted">낮음</span>{([1,2,3,4,5] as const).map(n => <button key={n} className={`confidence ${r.confidence === n ? 'selected' : ''}`} aria-label={'확신도 ' + n} aria-pressed={r.confidence === n} disabled={locked} onClick={() => dispatch({ type: 'confidence', value: n })}>{n}</button>)}<span className="small muted">높음</span></div></fieldset>
    </section><nav className="exam-navigator" aria-label="QF 문항 탐색"><h2>문항 탐색</h2><p className="small muted">✓ 답변 · — 미응답 · ○ 미방문<br/>L Later · S Skip</p><div className="exam-grid">{s.questionIds.map((id, i) => { const row = rows.find(r => r.questionId === id)!; return <button key={id} className={`exam-number ${hasQFAnswer(row) ? 'answered' : ''}`} aria-label={String(i + 1) + '번 문항'} aria-current={i === s.cursor ? 'step' : undefined} disabled={locked} onClick={() => navigate(i)}><strong>{i + 1}</strong><small>{hasQFAnswer(row) ? '✓' : row.shownAt === null ? '○' : '—'}{row.triage === 'LATER' ? ' L' : row.triage === 'SKIP' ? ' S' : ''}</small></button>; })}</div></nav></div>
    {error && <div className="alert" role="alert">{error}{failed.current && <div className="button-row"><button className="button secondary" disabled={busy} onClick={retry}>저장 재시도</button><button className="button secondary" onClick={() => downloadJSON(working.current, 'bio-sprint-qf-recovery.json')}>임시 기록 내보내기</button></div>}</div>}
    <div className="end-session">{confirmEnd ? <div className="end-confirm"><p>답변 {rows.filter(hasQFAnswer).length}/15문항. 제출하면 답안이 확정되고 결과가 공개됩니다.</p><div className="button-row"><button className="button secondary" disabled={locked} onClick={() => setConfirmEnd(false)}>계속 풀기</button><button className="button danger" disabled={locked || pending || busy} onClick={() => dispatch({ type: 'finish' })}>세트 제출하고 결과 보기</button></div></div> : <button className="button secondary" disabled={locked || pending || busy} onClick={() => setConfirmEnd(true)}>세트 제출</button>}</div>
    <p className="small muted">새로고침·다른 탭·기기 잠금 중에도 30분은 계속 경과합니다. 시간이 끝나면 저장된 답안으로 자동 종료됩니다.</p>
  </div>;
}
