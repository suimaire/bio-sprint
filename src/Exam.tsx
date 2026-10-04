import { useEffect, useRef, useState } from 'react';
import { type Session, type StudyData } from './model';
import { act, examNavigatorState, type Action } from './sessionEngine';
import { clockText, go, type Save } from './ui';
import { downloadJSON } from './storage';

export function ExamPlayer({ data, session: s, onSave, busy }: { data: StudyData; session: Session; onSave: Save; busy: boolean }) {
  const [now, setNow] = useState(Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const saving = useRef(false);
  const failed = useRef<StudyData | null>(null);
  const failedBase = useRef<StudyData | null>(null);
  const expiryAttempt = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const questionId = s.questionIds[s.cursor];
  const rows = data.responses.filter(r => r.sessionId === s.id);
  const r = rows.find(r => r.questionId === questionId)!;
  const q = data.questions.find(q => q.id === questionId)!;
  const remaining = Math.max(0, s.startedAt + s.timeLimitSec * 1000 - now);
  const locked = busy || saveFailed || !remaining;
  const hasDrafts = data.questions.some(q => s.questionIds.includes(q.id) && q.sourceType === 'DRAFT');

  async function persist(next: StudyData) {
    saving.current = true;
    const base = failedBase.current ?? data;
    try {
      if (await onSave(next, base)) {
        failed.current = null; failedBase.current = null; setSaveFailed(false); setError('');
        if (next.sessions.find(row => row.id === s.id)!.status === 'COMPLETED') go(`/session/${encodeURIComponent(s.id)}`);
      } else {
        failed.current = next; failedBase.current = base; setSaveFailed(true);
        setError('저장하지 못했습니다. 마지막 입력을 임시 보관 중입니다. 저장 재시도 또는 임시 기록 내보내기를 사용하세요.');
      }
    } finally { saving.current = false; }
  }
  async function dispatch(action: Action) {
    if (saving.current || busy || (saveFailed && action.type !== 'expire')) return;
    try {
      const source = failed.current ?? data;
      const next = act(source, s.id, action, Date.now());
      if (next !== source) await persist(next);
    } catch (e) { setError((e as Error).message); }
  }
  async function retry() {
    if (saving.current || !failed.current) return;
    const source = failed.current;
    const pendingSession = source.sessions.find(row => row.id === s.id)!;
    await persist(pendingSession.status === 'ACTIVE' ? act(source, s.id, { type: 'expire' }, Date.now()) : source);
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    const wake = () => setNow(Date.now());
    window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(timer); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); };
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); setConfirmEnd(false); }, [questionId]);
  useEffect(() => {
    if (!remaining && !busy && !saving.current && !expiryAttempt.current) {
      expiryAttempt.current = true; void dispatch({ type: 'expire' });
    }
  });
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (locked || saving.current || confirmEnd || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || target.closest('input,textarea,select,a,summary,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      let action: Action | undefined;
      if (/^[1-9]$/.test(key) && Number(key) <= q.choices.length) action = { type: 'submit', answer: Number(key) - 1 };
      if (key === 'l') action = { type: 'later' };
      if (key === 's') action = { type: 'skip' };
      if (key === 'arrowleft') action = { type: 'previous' };
      if (key === 'arrowright') action = { type: 'next' };
      if (action) { e.preventDefault(); void dispatch(action); }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });

  return <div className="exam-player">
    <header className="exam-toolbar"><div><span className="eyebrow">REAL EXAM — 90 MIN</span><h1>실전 시험 <span>{s.cursor + 1} / {s.questionIds.length}</span></h1><span className="small muted">답변 {rows.filter(r => r.selectedAnswer !== null).length} · 선택 즉시 저장</span></div><div className={`session-countdown ${remaining < 60000 ? 'urgent' : ''}`}><span>남은 시간</span><strong role="timer" aria-label="시험 남은 시간">{clockText(remaining)}</strong></div></header>
    {hasDrafts && <p className="exam-draft"><strong>DRAFT · 개발용 시험</strong> — 미검증 fixture 포함. 현재 문항 수는 실제 과부하 시험을 재현하기에 부족할 수 있습니다.</p>}
    <div className="exam-layout"><section className="question-stage exam-question"><div className="question-topline"><span className="small muted">문항 {s.cursor + 1}{q.language ? ` · ${q.language}` : ''}</span><span className={`badge ${q.sourceType === 'DRAFT' ? 'warning' : ''}`}>{q.sourceType}{q.fixture ? ' · 개발용' : ''}</span></div>
      <h2 ref={heading} tabIndex={-1} id="exam-question-heading" className="question-text">{q.question}</h2>
      <div className="choices" role="group" aria-labelledby="exam-question-heading">{q.choices.map((choice, i) => <button data-choice="true" className={`choice ${r.selectedAnswer === i ? 'selected' : ''}`} key={i} disabled={locked} aria-pressed={r.selectedAnswer === i} onClick={() => void dispatch({ type: 'submit', answer: i })}><span className="choice-number">{i + 1}</span><span>{choice}</span></button>)}</div>
      <div className="exam-actions"><div className="button-row"><button className="button secondary" disabled={locked} onClick={() => void dispatch({ type: 'later' })}>Later <kbd>L</kbd></button><button className="button secondary" disabled={locked} onClick={() => void dispatch({ type: 'skip' })}>Skip <kbd>S</kbd></button><button className="text-button" disabled={locked || r.selectedAnswer === null} onClick={() => void dispatch({ type: 'clear' })}>답안 지우기</button></div><div className="button-row"><button className="button secondary" disabled={locked || s.cursor === 0} onClick={() => void dispatch({ type: 'previous' })}>이전 ←</button><button className="button primary" disabled={locked || s.cursor === s.questionIds.length - 1} onClick={() => void dispatch({ type: 'next' })}>다음 →</button></div></div>
      <p className="small muted">1–9 답안 선택 · ← / → 이동 · Later / Skip은 기존 답안을 유지합니다.</p>
    </section><nav className="exam-navigator" aria-label="시험 문항 탐색"><h2>문항 탐색</h2><p className="small muted">✓ 답변 · L Later · S Skip<br/>— 미응답 · ○ 미방문 · 테두리: 현재</p><div className="exam-grid">{s.questionIds.map((id, index) => {
      const row = rows.find(r => r.questionId === id)!;
      const states = examNavigatorState(row);
      const symbols = states.map(state => ({ '답변함': '✓', Later: 'L', Skip: 'S', '미방문': '○', '미응답': '—' })[state]).join(' ');
      return <button key={id} className={`exam-number ${row.selectedAnswer !== null ? 'answered' : ''}`} aria-label={`${index + 1}번 ${states.join(', ')}${index === s.cursor ? ', 현재' : ''}`} aria-current={index === s.cursor ? 'step' : undefined} disabled={locked} onClick={() => void dispatch({ type: 'navigate', index })}><strong>{index + 1}</strong><small aria-hidden="true">{symbols}</small></button>;
    })}</div></nav></div>
    {error && <div role="alert" className="alert">{error}{saveFailed && <div className="button-row"><button className="button secondary" disabled={busy} onClick={() => void retry()}>저장 재시도</button><button className="button secondary" onClick={() => failed.current && downloadJSON(failed.current, 'bio-sprint-exam-recovery.json')}>임시 기록 내보내기</button></div>}</div>}
    <div className="end-session">{confirmEnd ? <div className="end-confirm" role="group" aria-label="시험 제출 확인"><p>답변 {rows.filter(r => r.selectedAnswer !== null).length} / {s.questionIds.length}문항. 제출 후 답안을 변경할 수 없습니다.</p><div className="button-row"><button className="button secondary" disabled={locked} onClick={() => setConfirmEnd(false)}>계속 풀기</button><button className="button danger" disabled={locked} onClick={() => void dispatch({ type: 'finish' })}>제출하고 결과 보기</button></div></div> : <button className="button secondary" disabled={locked} onClick={() => setConfirmEnd(true)}>시험 제출</button>}</div>
    <p className="small muted">전체 제한 시간과 현재 문항 시간은 다른 탭·새로고침 중에도 계속됩니다. 00:00에 자동 제출됩니다.</p>
  </div>;
}
