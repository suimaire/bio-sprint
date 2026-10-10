import { type Question, type SessionMode, type StudyData, type Session, type Response, type TriageDecision, type FailureType } from './model';

export interface TrainingConfig { mode: SessionMode; count: number; timeLimitSec: number; includeDrafts: boolean; domain?: string; questionIds?: string[] }
export function eligibleQuestions(questions: Question[], mode: SessionMode, includeDrafts: boolean, domain?: string) {
  return questions.filter(q => (mode === 'MIXED' || mode === 'REAL_EXAM' || q.mode === mode) && (includeDrafts || q.sourceType !== 'DRAFT') && (!domain || q.domain === domain));
}
export function createSession(data: StudyData, config: TrainingConfig, now: number, id: string): StudyData {
  if (data.sessions.some(s => s.status === 'ACTIVE') || data.qfSessions?.some(s => s.status === 'ACTIVE')) throw new Error('진행 중인 훈련을 먼저 완료해 주세요.');
  if (!Number.isInteger(config.count) || config.count < 1 || config.count > 100 || !Number.isFinite(config.timeLimitSec) || config.timeLimitSec < 1) throw new Error('문항 수와 제한 시간을 확인해 주세요.');
  let bank = eligibleQuestions(data.questions, config.mode, config.includeDrafts, config.domain);
  if (config.questionIds) bank = config.questionIds.map(id => bank.find(q => q.id === id)).filter((q): q is Question => !!q);
  const ids = [...new Set(bank.map(q => q.id))].slice(0, config.count);
  if (!ids.length) throw new Error('조건에 맞는 문제가 없습니다. 문제를 가져오거나 DRAFT 포함을 직접 선택해 주세요.');
  const session: Session = { id, mode: config.mode, questionIds: ids, queue: [...ids], cursor: 0, startedAt: now, endedAt: null, timeLimitSec: config.timeLimitSec, status: 'ACTIVE', includeDrafts: config.includeDrafts };
  const responses: Response[] = ids.map(questionId => ({ id: `${id}:${questionId}`, sessionId: id, questionId, outcome: 'PENDING', selectedAnswer: null, correct: null, confidence: null, failureType: null, shownAt: null, answeredAt: null, lastShownAt: null, responseTimeMs: 0, firstDecision: null, decisions: [], visitCount: 0, revisited: false }));
  if (config.mode === 'REAL_EXAM') for (const r of responses) Object.assign(r, { firstAnsweredAt: null, finalResponseAt: null, answerChangeCount: 0 });
  openQuestion(responses[0], now);
  return { ...data, sessions: [...data.sessions, session], responses: [...data.responses, ...responses] };
}
function openQuestion(r: Response, now: number) {
  r.shownAt ??= now;
  r.lastShownAt = now;
  r.visitCount++;
  r.revisited = r.visitCount > 1;
}
function closeQuestion(r: Response, now: number) {
  if (r.lastShownAt !== null) r.responseTimeMs += Math.max(0, now - r.lastShownAt);
  r.lastShownAt = null;
}
function decide(r: Response, decision: TriageDecision, now: number) {
  r.firstDecision ??= decision;
  r.decisions.push({ decision, at: now });
}
function complete(session: Session, rows: Response[], now: number) {
  for (const r of rows) if (r.outcome === 'PENDING') {
    closeQuestion(r, now);
    r.outcome = r.shownAt === null ? 'UNREACHED' : 'SKIPPED';
  }
  session.status = 'COMPLETED';
  session.endedAt = now;
}
function advance(session: Session, rows: Response[], now: number) {
  session.cursor++;
  while (session.cursor < session.queue.length) {
    const r = rows.find(r => r.questionId === session.queue[session.cursor])!;
    if (r.outcome === 'PENDING') { openQuestion(r, now); return; }
    session.cursor++;
  }
  complete(session, rows, now);
}
export type Action = { type: 'submit'; answer: number } | { type: 'navigate'; index: number } | { type: 'reflect'; confidence: Response['confidence']; failureType: FailureType | null } | { type: 'solve' | 'later' | 'skip' | 'next' | 'previous' | 'clear' | 'finish' | 'expire' };
export function act(data: StudyData, sessionId: string, action: Action, now: number): StudyData {
  const next = structuredClone(data);
  const s = next.sessions.find(s => s.id === sessionId);
  if (s?.mode === 'REAL_EXAM' && s.status === 'COMPLETED' && action.type === 'expire') return data;
  if (!s || s.status !== 'ACTIVE') throw new Error('이미 종료된 훈련입니다.');
  const rows = next.responses.filter(r => r.sessionId === s.id);
  const r = rows.find(r => r.questionId === s.queue[s.cursor])!;
  const deadline = s.startedAt + s.timeLimitSec * 1000;
  const time = Math.max(s.startedAt, Math.min(now, deadline));
  if (s.mode === 'REAL_EXAM') return examAction(data, next, s, rows, r, action, time, now >= deadline);
  if (action.type === 'navigate' || action.type === 'previous' || action.type === 'clear') throw new Error('REAL EXAM 전용 동작입니다.');
  if (action.type === 'reflect') {
    if (r.outcome !== 'ANSWERED') throw new Error('제출 후 진단을 기록해 주세요.');
    if (action.confidence !== null && (!Number.isInteger(action.confidence) || action.confidence < 1 || action.confidence > 5)) throw new Error('확신도는 1–5입니다.');
    r.confidence = action.confidence;
    r.failureType = r.correct ? null : action.failureType;
    return next;
  }
  if (action.type === 'expire') {
    if (now < deadline) return data;
    // Allow the submitted answer's confidence/failure tagging after the bell.
    if (r.outcome === 'ANSWERED') return data;
    complete(s, rows, deadline);
    return next;
  }
  if (action.type === 'finish') { complete(s, rows, time); return next; }
  if (action.type === 'next') {
    if (r.outcome !== 'ANSWERED' || r.confidence === null || (!r.correct && !r.failureType)) throw new Error('확신도와 오답 원인을 선택해 주세요.');
    if (now >= deadline) complete(s, rows, deadline); else advance(s, rows, time);
    return next;
  }
  if (r.outcome !== 'PENDING') throw new Error('이미 처리한 문제입니다.');
  if (now >= deadline) { complete(s, rows, deadline); return next; }
  if (action.type === 'submit') {
    const q = next.questions.find(q => q.id === r.questionId)!;
    if (!Number.isInteger(action.answer) || action.answer < 0 || action.answer >= q.choices.length) throw new Error('보기를 선택해 주세요.');
    if (r.decisions.at(-1)?.decision !== 'SOLVE') decide(r, 'SOLVE', time);
    closeQuestion(r, time);
    r.outcome = 'ANSWERED'; r.selectedAnswer = action.answer; r.correct = action.answer === q.answer; r.answeredAt = time;
  } else if (action.type === 'solve') {
    if (r.decisions.at(-1)?.decision !== 'SOLVE') decide(r, 'SOLVE', time);
  } else {
    if (s.mode !== 'MIXED') throw new Error('Later/Skip은 MIXED 훈련에서 사용합니다.');
    if (action.type === 'later' && r.decisions.some(d => d.decision === 'LATER')) throw new Error('다시 방문한 문제는 풀이 또는 건너뛰기를 선택해 주세요.');
    decide(r, action.type === 'later' ? 'LATER' : 'SKIP', time);
    closeQuestion(r, time);
    if (action.type === 'later') s.queue.push(r.questionId); else r.outcome = 'SKIPPED';
    advance(s, rows, time);
  }
  return next;
}

function examAction(original: StudyData, data: StudyData, s: Session, rows: Response[], r: Response, action: Action, time: number, expired: boolean): StudyData {
  if (expired || action.type === 'finish') {
    for (const row of rows) {
      closeQuestion(row, time);
      const q = data.questions.find(q => q.id === row.questionId)!;
      row.outcome = row.selectedAnswer !== null ? 'ANSWERED' : row.shownAt === null ? 'UNREACHED' : 'SKIPPED';
      row.correct = row.selectedAnswer === null ? null : row.selectedAnswer === q.answer;
    }
    s.status = 'COMPLETED'; s.endedAt = time; s.endReason = expired ? 'EXPIRED' : 'SUBMITTED';
    return data;
  }
  if (action.type === 'expire') return original;
  if (action.type === 'reflect' || action.type === 'solve') throw new Error('시험 중에는 답안과 이동만 기록합니다.');
  if (action.type === 'submit' || action.type === 'clear') {
    const answer = action.type === 'submit' ? action.answer : null;
    const q = data.questions.find(q => q.id === r.questionId)!;
    if (answer !== null && (!Number.isInteger(answer) || answer < 0 || answer >= q.choices.length)) throw new Error('보기를 선택해 주세요.');
    if (answer === r.selectedAnswer) return original;
    if (r.firstAnsweredAt !== null && r.firstAnsweredAt !== undefined) r.answerChangeCount = (r.answerChangeCount ?? 0) + 1;
    r.selectedAnswer = answer;
    r.answeredAt = answer === null ? null : time;
    if (answer !== null) {
      r.firstAnsweredAt ??= time;
      if (r.decisions.at(-1)?.decision !== 'SOLVE') decide(r, 'SOLVE', time);
    }
    r.finalResponseAt = time;
    return data;
  }
  if (action.type === 'later' || action.type === 'skip') {
    decide(r, action.type === 'later' ? 'LATER' : 'SKIP', time);
    r.finalResponseAt = time;
  }
  const index = action.type === 'navigate' ? action.index : action.type === 'previous' ? Math.max(0, s.cursor - 1) : Math.min(s.questionIds.length - 1, s.cursor + 1);
  if (!Number.isInteger(index) || index < 0 || index >= s.questionIds.length) throw new Error('문항 번호가 범위를 벗어났습니다.');
  if (index !== s.cursor) {
    closeQuestion(r, time);
    s.cursor = index;
    openQuestion(rows.find(row => row.questionId === s.questionIds[index])!, time);
  }
  return data;
}

export function examNavigatorState(r: Response): string[] {
  const states: string[] = [];
  if (r.selectedAnswer !== null) states.push('답변함');
  const triage = r.decisions.at(-1)?.decision;
  if (triage === 'LATER') states.push('Later');
  if (triage === 'SKIP') states.push('Skip');
  if (!states.length) states.push(r.shownAt === null ? '미방문' : '미응답');
  return states;
}

export function reflectExam(data: StudyData, sessionId: string, questionId: string, confidence: Response['confidence'], failureType: FailureType | null): StudyData {
  const s = data.sessions.find(s => s.id === sessionId);
  if (s?.mode !== 'REAL_EXAM' || s.status !== 'COMPLETED') throw new Error('시험 종료 후에만 진단할 수 있습니다.');
  if (confidence !== null && (!Number.isInteger(confidence) || confidence < 1 || confidence > 5)) throw new Error('확신도는 1–5입니다.');
  if (failureType !== null && !['K', 'R', 'T', 'C', 'S', 'L'].includes(failureType)) throw new Error('유효하지 않은 실패 유형입니다.');
  const next = structuredClone(data);
  const r = next.responses.find(r => r.sessionId === sessionId && r.questionId === questionId);
  if (!r) throw new Error('응답을 찾을 수 없습니다.');
  r.confidence = confidence; r.failureType = r.correct ? null : failureType;
  return next;
}
