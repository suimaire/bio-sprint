import { FAILURES, type StudyData } from './model';
import { hasQFAnswer, isChoice, SELF_GRADES, type QFResponse, type QFSession, type SelfGrade } from './qfModel';

export function startQF(data: StudyData, runId: string, now: number, id: string): StudyData {
  if (data.sessions.some(s => s.status === 'ACTIVE') || data.qfSessions?.some(s => s.status === 'ACTIVE')) throw new Error('진행 중인 훈련을 먼저 완료해 주세요.');
  const p = data.qfPackages?.find(p => p.run_id === runId);
  if (!p) throw new Error('QF 패키지를 먼저 가져와 주세요.');
  if (p.preset !== 'daily15') throw new Error(p.preset === 'standard50' ? 'STANDARD-50은 권장 시간 수정 전까지 시작할 수 없습니다.' : '이번 단계에서는 DAILY-15만 시작할 수 있습니다.');
  if (p.questions.length !== 15) throw new Error('DAILY-15는 전체 15문항이 필요합니다.');
  if (!Number.isSafeInteger(now) || now < 0 || !id || data.qfSessions?.some(s => s.id === id) || data.sessions.some(s => s.id === id)) throw new Error('세션 ID/시각을 확인해 주세요.');
  const s: QFSession = { id, runId, questionIds: [...p.question_ids], cursor: 0, startedAt: now, lastEventAt: now, endedAt: null, timeLimitSec: 1800, status: 'ACTIVE' };
  const responses: QFResponse[] = p.questions.map(w => ({
    id: id + ':' + w.id, sessionId: id, runId, questionId: w.id, selectedOption: null, textAnswer: '',
    outcome: 'PENDING', gradingMode: isChoice(w.question) ? 'AUTO' : 'SELF', correct: null, selfGrade: null,
    confidence: null, failureType: null, shownAt: null, lastShownAt: null, answeredAt: null,
    firstAnsweredAt: null, finalResponseAt: null, responseTimeMs: 0, visitCount: 0, revisited: false, answerChangeCount: 0,
    stage: w.question.stage, level: w.question.level, domain: w.question.macro_domain,
    reasoning_load: w.question.reasoning_load, language_load: w.question.language_load,
  }));
  open(responses[0], now);
  return { ...data, qfSessions: [...(data.qfSessions ?? []), s], qfResponses: [...(data.qfResponses ?? []), ...responses] };
}
function open(r: QFResponse, now: number) { r.shownAt ??= now; r.lastShownAt = now; r.visitCount++; r.revisited = r.visitCount > 1; }
function close(r: QFResponse, now: number) { if (r.lastShownAt !== null) r.responseTimeMs += Math.max(0, now - r.lastShownAt); r.lastShownAt = null; }
export type QFAction = { type: 'choice'; value: string | null } | { type: 'text'; value: string } | { type: 'confidence'; value: QFResponse['confidence'] } | { type: 'triage'; value: 'LATER' | 'SKIP' | null } | { type: 'navigate'; index: number } | { type: 'finish' | 'expire' };
export function actQF(data: StudyData, sessionId: string, action: QFAction, now: number): StudyData {
  const prior = data.qfSessions?.find(s => s.id === sessionId);
  if (!prior || prior.status !== 'ACTIVE') { if (prior && action.type === 'expire') return data; throw new Error('이미 종료된 QF 훈련입니다.'); }
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('유효하지 않은 시각입니다.');
  const deadline = prior.startedAt + prior.timeLimitSec * 1000;
  const time = Math.min(deadline, Math.max(prior.lastEventAt, now));
  const expired = time >= deadline;
  if (action.type === 'expire' && !expired) return data;
  const s = { ...prior, lastEventAt: time };
  const rows = data.qfResponses!.filter(r => r.sessionId === s.id).map(r => ({ ...r }));
  const p = data.qfPackages!.find(p => p.run_id === s.runId)!;
  const r = rows.find(r => r.questionId === s.questionIds[s.cursor])!;
  const q = p.questions.find(w => w.id === r.questionId)!.question;
  if (expired || action.type === 'finish') {
    for (const row of rows) {
      close(row, time);
      row.outcome = hasQFAnswer(row) ? 'ANSWERED' : 'UNANSWERED';
      const item = p.questions.find(w => w.id === row.questionId)!;
      row.correct = row.gradingMode === 'AUTO' && hasQFAnswer(row) ? row.selectedOption === item.question.correct_answer : null;
    }
    s.status = 'COMPLETED'; s.endedAt = time; s.endReason = expired ? 'EXPIRED' : 'SUBMITTED';
  } else if (action.type === 'navigate') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= s.questionIds.length) throw new Error('문항 번호가 범위를 벗어났습니다.');
    if (action.index === s.cursor) return data;
    close(r, time); s.cursor = action.index; open(rows.find(row => row.questionId === s.questionIds[s.cursor])!, time);
  } else if (action.type === 'triage') {
    if (action.value !== null && !['LATER', 'SKIP'].includes(action.value)) throw new Error('Later/Skip 표시를 확인해 주세요.');
    r.triage = action.value;
    if (action.value !== null && s.cursor < s.questionIds.length - 1) {
      close(r, time); s.cursor++; open(rows.find(row => row.questionId === s.questionIds[s.cursor])!, time);
    }
  } else if (action.type === 'confidence') {
    checkConfidence(action.value); r.confidence = action.value;
  } else if (action.type === 'choice' || action.type === 'text') {
    if (action.type === 'choice') {
      if (!isChoice(q) || (action.value !== null && !Object.hasOwn(q.options!, action.value))) throw new Error('유효한 보기를 선택해 주세요.');
      if (r.selectedOption === action.value) return data;
      r.selectedOption = action.value;
    } else {
      if (isChoice(q) || typeof action.value !== 'string' || action.value.length > 100000) throw new Error('텍스트 답안은 100,000자 이내로 입력해 주세요.');
      if (r.textAnswer === action.value) return data;
      r.textAnswer = action.value; // Preserve whitespace, line breaks and all original input.
    }
    if (r.firstAnsweredAt !== null) r.answerChangeCount++;
    if (hasQFAnswer(r)) r.firstAnsweredAt ??= time;
    r.answeredAt = hasQFAnswer(r) ? time : null; r.finalResponseAt = time;
  }
  return { ...data, qfSessions: data.qfSessions!.map(old => old.id === s.id ? s : old), qfResponses: data.qfResponses!.map(old => old.sessionId === s.id ? rows.find(row => row.id === old.id)! : old) };
}
function checkConfidence(c: QFResponse['confidence']) { if (c !== null && (!Number.isInteger(c) || c < 1 || c > 5)) throw new Error('확신도는 1–5입니다.'); }
export function gradeQF(data: StudyData, sessionId: string, questionId: string, patch: { selfGrade?: SelfGrade; rubricChecks?: (boolean | null)[]; confidence?: QFResponse['confidence']; failureType?: QFResponse['failureType'] }): StudyData {
  const s = data.qfSessions?.find(s => s.id === sessionId);
  if (!s || s.status !== 'COMPLETED') throw new Error('풀이 종료 후에만 채점과 진단을 기록할 수 있습니다.');
  const old = data.qfResponses?.find(r => r.sessionId === sessionId && r.questionId === questionId);
  if (!old) throw new Error('응답을 찾을 수 없습니다.');
  const r = { ...old };
  if (patch.rubricChecks !== undefined) {
    const q = data.qfPackages!.find(p => p.run_id === s.runId)!.questions.find(w => w.id === questionId)!.question;
    if (r.gradingMode !== 'SELF' || !hasQFAnswer(r) || !Array.isArray(patch.rubricChecks) || patch.rubricChecks.length !== q.scoring_points!.length || !patch.rubricChecks.every(v => v === null || typeof v === 'boolean')) throw new Error('응답한 주관식의 원본 채점 기준별 확인이 필요합니다.');
    r.rubricChecks = [...patch.rubricChecks];
  }
  if (patch.selfGrade !== undefined) {
    if (r.gradingMode !== 'SELF' || !hasQFAnswer(r) || !Object.hasOwn(SELF_GRADES, patch.selfGrade)) throw new Error('응답한 주관식 문항만 자기 채점할 수 있습니다.');
    r.selfGrade = patch.selfGrade;
    r.correct = patch.selfGrade === 'CORRECT' ? true : patch.selfGrade === 'INCORRECT' ? false : null;
  }
  if (patch.confidence != null && r.shownAt === null) throw new Error('미방문 문항의 풀이 확신도는 기록할 수 없습니다.');
  if (patch.confidence !== undefined) { checkConfidence(patch.confidence); r.confidence = patch.confidence; }
  if (patch.failureType !== undefined) {
    if (patch.failureType !== null && !Object.hasOwn(FAILURES, patch.failureType)) throw new Error('실패 유형을 확인해 주세요.');
    r.failureType = patch.failureType;
  }
  if (r.correct === true) r.failureType = null;
  return { ...data, qfResponses: data.qfResponses!.map(old => old.id === r.id ? r : old) };
}
export function summarizeQF(data: StudyData, sessionId?: string) {
  const complete = new Set(data.qfSessions?.filter(s => s.status === 'COMPLETED' && (!sessionId || s.id === sessionId)).map(s => s.id));
  const rows = (data.qfResponses ?? []).filter(r => complete.has(r.sessionId));
  return {
    total: rows.length, answered: rows.filter(hasQFAnswer).length,
    autoCorrect: rows.filter(r => r.gradingMode === 'AUTO' && r.correct === true).length,
    autoWrong: rows.filter(r => r.gradingMode === 'AUTO' && r.correct === false).length,
    autoGraded: rows.filter(r => r.gradingMode === 'AUTO' && hasQFAnswer(r)).length,
    selfGraded: rows.filter(r => r.selfGrade === 'CORRECT' || r.selfGrade === 'INCORRECT' || r.selfGrade === 'PARTIAL').length,
    selfCorrect: rows.filter(r => r.selfGrade === 'CORRECT').length,
    selfWrong: rows.filter(r => r.selfGrade === 'INCORRECT').length,
    partial: rows.filter(r => r.selfGrade === 'PARTIAL').length,
    deferred: rows.filter(r => r.selfGrade === 'DEFERRED').length,
    ungraded: rows.filter(r => r.gradingMode === 'SELF' && hasQFAnswer(r) && r.selfGrade === null).length,
    unanswered: rows.filter(r => !hasQFAnswer(r)).length,
    languageErrors: rows.filter(r => r.failureType === 'L').length,
    knowledgeErrors: rows.filter(r => r.failureType === 'K').length,
  };
}
