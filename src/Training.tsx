import { useEffect, useRef, useState } from 'react';
import { FAILURES, MODES, TAXONOMY, type FailureType, type Session, type SessionMode, type StudyData } from './model';
import { act, createSession, eligibleQuestions, type Action } from './sessionEngine';
import { classifyTime, diagnosticFlags, FLAG_LABELS, reviewQueue } from './metrics';
import { clockText, go, Icon, Link, routePath, seconds, type Save } from './ui';
import { ExamPlayer } from './Exam';

const descriptions = { REAL_EXAM: ['90분 실전 시험', '전체 문제 · 자유 이동 · 종료 후 채점'], MIXED: ['시간 안배', '회상 · 해석 · 심화 문제를 골라 풀기'], RECALL: ['빠른 회상', '핵심 개념을 5–20초 안에 떠올리기'], INTERPRET: ['자료 해석', '표와 실험에서 근거를 읽어내기'], DEEP: ['심화 추론', '계산과 기전을 차근히 연결하기'] };
export function Training({ data, onSave, busy }: { data: StudyData; onSave: Save; busy: boolean }) {
  const active = data.sessions.find(s => s.status === 'ACTIVE');
  return active ? active.mode === 'REAL_EXAM' ? <ExamPlayer key={active.id} data={data} session={active} onSave={onSave} busy={busy}/> : <SessionPlayer key={active.id} data={data} session={active} onSave={onSave} busy={busy}/> : <Setup data={data} onSave={onSave} busy={busy}/>;
}
function Setup({ data, onSave, busy }: { data: StudyData; onSave: Save; busy: boolean }) {
  const params = new URLSearchParams(routePath().split('?')[1]);
  const reviewing = params.get('review') === '1';
  const [mode, setMode] = useState<SessionMode>('MIXED');
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [count, setCount] = useState('10');
  const [minutes, setMinutes] = useState('5');
  const [drafts, setDrafts] = useState(false);
  const [error, setError] = useState('');
  const exam = mode === 'REAL_EXAM';
  const reviewIds = reviewing && !exam ? reviewQueue(data).map(row => row.question.id) : undefined;
  const bank = eligibleQuestions(data.questions, mode, drafts, exam ? undefined : domain).filter(q => !reviewIds || reviewIds.includes(q.id));
  async function start() {
    try {
      const n = exam ? Math.min(100, bank.length) : Number(count), limit = exam ? 90 : Number(minutes);
      if (!Number.isInteger(n) || n < 1 || n > 100 || !Number.isInteger(limit) || limit < 1 || limit > 120) throw new Error('문항 수는 1–100, 제한 시간은 1–120분 정수로 입력해 주세요.');
      // Prefer least recently seen questions; MIXED starts with each available mode.
      const lastSeen = (id: string) => Math.max(0, ...data.responses.filter(r => r.questionId === id).map(r => r.shownAt ?? 0));
      const sorted = [...bank].sort((a, b) => lastSeen(a.id) - lastSeen(b.id));
      const firstModes = (mode === 'MIXED' || exam) && !reviewIds ? MODES.flatMap(m => sorted.find(q => q.mode === m)?.id ?? []) : [];
      const ids = reviewIds ?? [...new Set([...firstModes, ...sorted.map(q => q.id)])];
      const next = createSession(data, { mode, count: n, timeLimitSec: limit * 60, includeDrafts: drafts, domain: exam ? undefined : domain, questionIds: ids }, Date.now(), crypto.randomUUID());
      await onSave(next);
    } catch (e) { setError((e as Error).message); }
  }
  return <><header className="page-heading"><div><span className="eyebrow">{reviewing ? 'PRIORITY REVIEW' : 'TRAINING SETUP'}</span><h1>{reviewing ? '우선순위 복습' : '오늘은 어떻게 훈련할까요?'}</h1><p>문항 수보다 중요한 것은, 시간 안에 내린 좋은 판단입니다.</p></div></header>
    <fieldset className="mode-picker"><legend>훈련 모드</legend>{(['REAL_EXAM', 'MIXED', ...MODES] as SessionMode[]).map(m => <label className={`mode-option ${m === 'REAL_EXAM' ? 'exam-mode-option' : ''} ${mode === m ? 'selected' : ''}`} key={m}><input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)}/><span className="mode-name">{m === 'REAL_EXAM' ? 'REAL EXAM — 90 MIN' : m}</span><strong>{descriptions[m][0]}</strong><span className="small muted">{descriptions[m][1]}</span></label>)}</fieldset>
    <section className="panel setup-panel"><div className="section-heading"><h2>세션 설정</h2><span className="badge">브라우저에 자동 저장</span></div><div className="setup-fields"><label>영역<select disabled={exam} value={exam ? '' : domain} onChange={e => setDomain(e.target.value)}><option value="">전체 영역</option>{Object.entries(TAXONOMY).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label>문항 수<input type="number" min="1" max="100" disabled={exam} value={exam ? Math.min(100, bank.length) : count} onChange={e => setCount(e.target.value)}/></label><label>제한 시간 (분)<input type="number" min="1" max="120" disabled={exam} value={exam ? 90 : minutes} onChange={e => setMinutes(e.target.value)}/></label></div>
      <div className="trust-setting"><strong>기본 출처: VERIFIED + REVIEWED</strong><label className="check-label"><input type="checkbox" checked={drafts} onChange={e => setDrafts(e.target.checked)}/>DRAFT 개발용 문제 포함</label><p className="small muted">기본 27문항은 미검증 개발용 fixture입니다. 신뢰할 수 있는 문제를 JSON으로 가져와 실제 훈련에 사용하세요.</p></div>
      <div className="setup-bottom"><div><strong>사용 가능 {bank.length}문항</strong><p className="small muted">이번 세션: 최대 {Math.min(exam ? 100 : Number(count) || 0, bank.length)}문항 · {exam ? 90 : Number(minutes) || 0}분</p>{!bank.length && <Link href="/question-bank" className="text-link">조건에 맞는 문제 가져오기 →</Link>}</div><button className="button primary large" disabled={busy || !bank.length} onClick={() => void start()}>{exam ? 'REAL EXAM 시작' : '훈련 시작'} <Icon name="arrow"/></button></div>
      {error && <p className="alert" role="alert">{error}</p>}
    </section>{exam ? <aside className="training-guide"><h2>90분 동안 답안과 시간 판단에 집중하세요</h2><p>숫자 1–9: 답안 선택 · L: Later · S: Skip · ← / →: 이동. 확신도와 진단은 종료 후 선택합니다.</p><p>사용 가능한 서로 다른 문항을 최대 100개 사용합니다. 문항을 복제하지 않습니다. 기본 27개 DRAFT는 개발 확인용이며 과부하 실전 모의고사로 충분하지 않습니다.</p><p>과거 한 차례의 90분 시험 기록을 참고한 프리셋이며 올해 시험 시간·구성의 확정 정보가 아닙니다.</p></aside> : <aside className="training-guide"><h2>풀이에만 집중하세요</h2><div><p><kbd>1</kbd>–<kbd>9</kbd> 보기 선택 · <kbd>Enter</kbd> 제출</p><p>제출 후 <kbd>1</kbd>–<kbd>5</kbd> 확신도 · <kbd>K</kbd> <kbd>R</kbd> <kbd>T</kbd> <kbd>C</kbd> <kbd>S</kbd> 오답 원인</p><p><kbd>Space</kbd> 다음 · MIXED에서 <kbd>L</kbd> 나중에 / <kbd>S</kbd> 건너뛰기</p></div><p className="small muted">문제 시간은 제출 시 멈춥니다. 전체 제한 시간은 피드백·다른 탭·새로고침 중에도 계속됩니다. Later는 문제당 한 번만 가능합니다.</p></aside>}
  </>;
}
function SessionPlayer({ data, session: s, onSave, busy }: { data: StudyData; session: Session; onSave: Save; busy: boolean }) {
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const focus = useRef<HTMLHeadingElement>(null);
  const expiryAttempt = useRef(false);
  const questionId = s.queue[s.cursor];
  const q = data.questions.find(q => q.id === questionId)!;
  const r = data.responses.find(r => r.sessionId === s.id && r.questionId === questionId)!;
  const feedback = r.outcome === 'ANSWERED';
  const deadline = s.startedAt + s.timeLimitSec * 1000;
  const remaining = Math.max(0, deadline - now);
  const elapsed = r.responseTimeMs + (r.lastShownAt === null ? 0 : Math.max(0, Math.min(now, deadline) - r.lastShownAt));
  const completed = data.responses.filter(r => r.sessionId === s.id && r.outcome !== 'PENDING').length;
  const canNext = r.confidence !== null && (r.correct || r.failureType !== null);
  const last = !data.responses.some(row => row.sessionId === s.id && row.outcome === 'PENDING');
  async function dispatch(action: Action) {
    if (busy) return;
    setError('');
    try {
      const next = act(data, s.id, action, Date.now());
      if (next === data) return;
      if (await onSave(next)) {
        if (next.sessions.find(row => row.id === s.id)!.status === 'COMPLETED') go(`/session/${encodeURIComponent(s.id)}`);
        setConfirmEnd(false);
      }
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => { setSelected(null); setError(''); setConfirmEnd(false); focus.current?.focus(); }, [questionId, feedback]);
  useEffect(() => {
    if (!remaining && !feedback && !busy && !expiryAttempt.current) { expiryAttempt.current = true; void dispatch({ type: 'expire' }); }
  });
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (busy || confirmEnd || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || target.closest('input,textarea,select,a,summary,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (/^[1-9]$/.test(key)) {
        const value = Number(key);
        if (!feedback && value <= q.choices.length) { e.preventDefault(); setSelected(value - 1); }
        else if (feedback && value <= 5) { e.preventDefault(); void dispatch({ type: 'reflect', confidence: value as 1 | 2 | 3 | 4 | 5, failureType: r.failureType }); }
      } else if (key === 'enter' && !feedback && (target.tagName !== 'BUTTON' || target.hasAttribute('data-choice'))) {
        e.preventDefault(); if (selected !== null) void dispatch({ type: 'submit', answer: selected });
      } else if (key === ' ' && feedback && canNext) {
        e.preventDefault(); void dispatch({ type: 'next' });
      } else if (feedback && !r.correct && Object.keys(FAILURES).includes(key.toUpperCase())) {
        e.preventDefault(); void dispatch({ type: 'reflect', confidence: r.confidence, failureType: key.toUpperCase() as FailureType });
      } else if (!feedback && s.mode === 'MIXED' && (key === 'l' || key === 's')) {
        if (key === 'l' && r.decisions.some(d => d.decision === 'LATER')) return;
        e.preventDefault(); void dispatch({ type: key === 'l' ? 'later' : 'skip' });
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  return <div className="session-player"><div className="session-top"><div><span className="eyebrow">{s.mode} SESSION</span><h1>집중 훈련 <span>{completed}/{s.questionIds.length}</span></h1></div><div className={`session-countdown ${remaining < 30000 ? 'urgent' : ''}`}><span>남은 시간</span><strong aria-label={`남은 시간 ${clockText(remaining)}`}>{clockText(remaining)}</strong></div></div><progress aria-label="세션 진행도" value={completed} max={s.questionIds.length}/>
    <section className="question-stage"><div className="question-topline"><div className="tags"><span className="badge dark">{q.mode}</span><span className="badge">{TAXONOMY[q.domain]}</span><span className={`badge ${q.sourceType === 'DRAFT' ? 'warning' : ''}`}>{q.sourceType}{q.fixture ? ' · 개발용' : ''}</span>{r.revisited && <span className="badge">재방문</span>}</div><span className="question-time">{seconds(elapsed)} <small>/ 목표 {q.targetTimeSec}초</small></span></div>
      <p className="small muted">{q.subdomain} · 난이도 {q.difficulty}/5</p><h2 ref={focus} tabIndex={-1} className="question-text" id="question-heading">{q.question}</h2>
      <div className="choices" role="group" aria-labelledby="question-heading">{q.choices.map((choice, i) => <button data-choice="true" key={i} className={`choice ${(feedback ? r.selectedAnswer : selected) === i ? 'selected' : ''} ${feedback && q.answer === i ? 'correct' : ''} ${feedback && r.selectedAnswer === i && !r.correct ? 'wrong' : ''}`} disabled={feedback || busy || remaining === 0} aria-pressed={(feedback ? r.selectedAnswer : selected) === i} onClick={() => setSelected(i)}><span className="choice-number">{i + 1}</span><span>{choice}</span>{feedback && q.answer === i && <strong className="choice-result">정답</strong>}{feedback && r.selectedAnswer === i && !r.correct && <strong className="choice-result">내 답</strong>}</button>)}</div>
      {!feedback ? <><div className="answer-actions"><div className="button-row">{s.mode === 'MIXED' && <><button className="button secondary" disabled={busy || remaining === 0} onClick={() => void dispatch({ type: 'solve' })}>{r.decisions.at(-1)?.decision === 'SOLVE' ? '풀이 선택됨' : '풀기 · SOLVE'}</button><button className="button secondary" disabled={busy || remaining === 0 || r.decisions.some(d => d.decision === 'LATER')} onClick={() => void dispatch({ type: 'later' })}>나중에 <kbd>L</kbd></button><button className="button secondary" disabled={busy || remaining === 0} onClick={() => void dispatch({ type: 'skip' })}>건너뛰기 <kbd>S</kbd></button></>}</div><button className="button primary" disabled={selected === null || busy || remaining === 0} onClick={() => selected !== null && void dispatch({ type: 'submit', answer: selected })}>정답 제출 <kbd>Enter</kbd></button></div><p className="small muted">숫자로 보기 선택 · 제출하면 풀이 시간이 기록됩니다.</p></> : <div className="feedback" aria-live="polite"><div className={`feedback-heading ${r.correct ? 'good' : 'bad'}`}><h3>{r.correct ? '정답입니다' : '오답입니다'}</h3><span>{seconds(r.responseTimeMs)} · {classifyTime(r.responseTimeMs, q.targetTimeSec)}</span></div>
        <div className="reflection"><fieldset><legend>방금 답에 얼마나 확신했나요?</legend><div className="confidence-row"><span className="small muted">낮음</span>{[1, 2, 3, 4, 5].map(c => <button key={c} className={`confidence ${r.confidence === c ? 'selected' : ''}`} aria-label={`확신도 ${c}`} aria-pressed={r.confidence === c} disabled={busy} onClick={() => void dispatch({ type: 'reflect', confidence: c as 1 | 2 | 3 | 4 | 5, failureType: r.failureType })}>{c}</button>)}<span className="small muted">높음</span></div></fieldset>{!r.correct && <fieldset><legend>오답 원인 하나를 선택하세요</legend><div className="failure-row">{Object.entries(FAILURES).map(([key, label]) => <button className={`failure ${r.failureType === key ? 'selected' : ''}`} key={key} aria-pressed={r.failureType === key} disabled={busy} onClick={() => void dispatch({ type: 'reflect', confidence: r.confidence, failureType: key as FailureType })}><kbd>{key}</kbd> {label}</button>)}</div></fieldset>}</div>
        <details className="explanation" open={!!canNext}><summary>정답과 해설</summary><p><strong>{q.answer + 1}. {q.choices[q.answer]}</strong></p><p>{q.explanation}</p><div className="tags">{diagnosticFlags(q, r).map(f => <span className="badge warning" key={f}>{FLAG_LABELS[f]}</span>)}</div></details>
        {!remaining && <p className="alert">제한 시간이 끝났습니다. 진단을 기록한 뒤 결과를 확인하세요.</p>}
        <div className="feedback-bottom"><span className="small muted">{canNext ? '기록 완료 · Space로 계속' : '확신도와 오답 원인을 기록해 주세요'}</span><button className="button primary" disabled={!canNext || busy} onClick={() => void dispatch({ type: 'next' })}>{last || !remaining ? '결과 보기' : '다음 문제'} <Icon name="arrow"/></button></div>
      </div>}
      {error && <p className="alert" role="alert">{error}</p>}
    </section>
    {!feedback && <div className="end-session">{confirmEnd ? <div className="end-confirm"><p>지금 종료하면 남은 문제는 미응답으로 기록됩니다.</p><div className="button-row"><button className="button secondary" disabled={busy} onClick={() => setConfirmEnd(false)}>계속 풀기</button><button className="button danger" disabled={busy} onClick={() => void dispatch({ type: 'finish' })}>종료하고 결과 보기</button></div></div> : <button className="text-button" onClick={() => setConfirmEnd(true)}>훈련 조기 종료</button>}</div>}
  </div>;
}
