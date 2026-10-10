import type { StudyData } from './model';
import { FAILURES } from './model';
import { hasQFAnswer, isChoice, SELF_GRADES, type QFResponse, type QFSession } from './qfModel';
import { canonicalQF } from './qfDigest';
import { objectQF, requireQF, validateQFPackage } from './qfImport';

const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v === v.trim();
export function validateQFData(value: Record<string, unknown>) {
  for (const key of ['qfPackages', 'qfSessions', 'qfResponses']) requireQF(value[key] === undefined || Array.isArray(value[key]), key + ': 배열이 필요합니다.');
  const packages = (value.qfPackages as unknown[] | undefined ?? []).map(validateQFPackage);
  requireQF(new Set(packages.map(p => p.run_id)).size === packages.length, '중복 QF run_id');
  const sessions = (value.qfSessions ?? []) as QFSession[], responses = (value.qfResponses ?? []) as QFResponse[];
  const legacy = (value.sessions ?? []) as StudyData['sessions'];
  const ids = new Set<string>(), responseIds = new Set<string>(), pairs = new Set<string>();
  let active = legacy.filter(s => s.status === 'ACTIVE').length;
  for (const s of sessions) {
    requireQF(objectQF(s) && id(s.id) && !ids.has(s.id) && !legacy.some(old => old.id === s.id), '세션 ID 누락/중복'); ids.add(s.id);
    const p = packages.find(p => p.run_id === s.runId);
    requireQF(p?.preset === 'daily15' && canonicalQF(s.questionIds) === canonicalQF(p.question_ids) && s.timeLimitSec === 1800, 'DAILY-15 세션의 run/순서/시간 불일치');
    requireQF(integer(s.cursor, 0, 14) && integer(s.startedAt, 0, 8640000000000000 - 1800000) && integer(s.lastEventAt, s.startedAt, s.startedAt + 1800000), '세션 위치/시각 오류');
    if (s.status === 'ACTIVE') { active++; requireQF(s.endedAt === null && s.endReason === undefined, '진행 중인 세션에 결과가 있습니다.'); }
    else requireQF(s.status === 'COMPLETED' && integer(s.endedAt, s.startedAt, s.startedAt + 1800000) && s.lastEventAt === s.endedAt && ['SUBMITTED','EXPIRED'].includes(s.endReason ?? '') && (s.endReason !== 'EXPIRED' || s.endedAt === s.startedAt + 1800000), '종료 시각/사유 오류');
  }
  requireQF(active <= 1, '기존 훈련과 QF 훈련은 동시에 진행할 수 없습니다.');
  for (const r of responses) {
    requireQF(objectQF(r) && id(r.id) && !responseIds.has(r.id), '응답 ID 누락/중복'); responseIds.add(r.id);
    const s = sessions.find(s => s.id === r.sessionId), p = packages.find(p => p.run_id === s?.runId);
    const w = p?.questions.find(w => w.id === r.questionId), q = w?.question;
    requireQF(s && q && r.runId === s.runId && s.questionIds.includes(r.questionId) && r.id === s.id + ':' + r.questionId, '응답 세션/run/문항 참조 오류');
    const pair = canonicalQF([s.id, r.questionId]); requireQF(!pairs.has(pair), '문항 응답 중복'); pairs.add(pair);
    requireQF(r.stage === q.stage && r.level === q.level && r.domain === q.macro_domain && r.reasoning_load === q.reasoning_load && r.language_load === q.language_load, '응답 메타데이터 불일치');
    requireQF(r.gradingMode === (isChoice(q) ? 'AUTO' : 'SELF') && typeof r.textAnswer === 'string' && r.textAnswer.length <= 100000, '채점 종류/텍스트 답안 오류');
    requireQF(isChoice(q) ? r.textAnswer === '' && (r.selectedOption === null || typeof r.selectedOption === 'string' && Object.hasOwn(q.options!, r.selectedOption)) : r.selectedOption === null, '형식과 답안 불일치');
    requireQF(r.selfGrade === null || r.gradingMode === 'SELF' && Object.hasOwn(SELF_GRADES, r.selfGrade) && hasQFAnswer(r), '자기 채점 오류');
    requireQF(r.triage === undefined || r.triage === null || ['LATER', 'SKIP'].includes(r.triage) && r.shownAt !== null, 'Later/Skip 표시 오류');
    requireQF(r.rubricChecks === undefined || s.status === 'COMPLETED' && r.gradingMode === 'SELF' && hasQFAnswer(r) && Array.isArray(r.rubricChecks) && r.rubricChecks.length === q.scoring_points!.length && r.rubricChecks.every(v => v === null || typeof v === 'boolean'), '채점 기준별 확인 오류');
    requireQF(r.confidence === null || integer(r.confidence, 1, 5), '확신도 오류');
    requireQF(r.failureType === null || typeof r.failureType === 'string' && Object.hasOwn(FAILURES, r.failureType), '실패 유형 오류');
    const end = s.endedAt ?? s.lastEventAt;
    for (const key of ['shownAt','lastShownAt','answeredAt','firstAnsweredAt','finalResponseAt'] as const) requireQF(r[key] === null || integer(r[key], s.startedAt, end), key + ': 응답 시각 오류');
    requireQF(integer(r.responseTimeMs, 0, 1800000) && integer(r.visitCount) && integer(r.answerChangeCount) && r.revisited === (r.visitCount > 1), '방문/변경/풀이 시간 오류');
    requireQF(r.shownAt === null ? r.visitCount === 0 && r.responseTimeMs === 0 && r.firstAnsweredAt === null && r.finalResponseAt === null && r.confidence === null : r.visitCount >= 1 && r.responseTimeMs <= end - r.shownAt, '방문과 풀이 기록 불일치');
    requireQF(r.lastShownAt === null || r.shownAt !== null && r.lastShownAt >= r.shownAt, '열린 타이머 시각 오류');
    requireQF(!hasQFAnswer(r) || r.shownAt !== null && r.firstAnsweredAt !== null && r.answeredAt !== null, '답안 시각 누락');
    requireQF(r.answeredAt === null || hasQFAnswer(r) && r.firstAnsweredAt !== null && r.answeredAt >= r.firstAnsweredAt && r.finalResponseAt !== null && r.finalResponseAt >= r.answeredAt, '답안 시각 순서 오류');
    requireQF(r.firstAnsweredAt === null || r.shownAt !== null && r.firstAnsweredAt >= r.shownAt, '최초 답안 시각 오류');
    requireQF(r.answerChangeCount === 0 || r.firstAnsweredAt !== null, '답안 변경 기록 오류');
    if (s.status === 'ACTIVE') {
      requireQF(r.outcome === 'PENDING' && r.correct === null && r.selfGrade === null && r.failureType === null, '풀이 중 채점/정답 공개 불가');
      requireQF(r.questionId === s.questionIds[s.cursor] ? r.lastShownAt !== null : r.lastShownAt === null, '현재 문항만 타이머를 열 수 있습니다.');
    } else {
      requireQF(r.outcome === (hasQFAnswer(r) ? 'ANSWERED' : 'UNANSWERED') && r.lastShownAt === null, '종료 결과 불일치');
      const correct = r.gradingMode === 'AUTO' ? hasQFAnswer(r) ? r.selectedOption === q.correct_answer : null : r.selfGrade === 'CORRECT' ? true : r.selfGrade === 'INCORRECT' ? false : null;
      requireQF(r.correct === correct && (r.correct !== true || r.failureType === null), '객관식/자기 채점 결과 불일치');
    }
  }
  for (const s of sessions) {
    for (const qid of s.questionIds) requireQF(pairs.has(canonicalQF([s.id, qid])), '문항 응답 레코드 누락');
    requireQF(responses.filter(r => r.sessionId === s.id).reduce((sum, r) => sum + r.responseTimeMs, 0) <= (s.endedAt ?? s.lastEventAt) - s.startedAt, '문항 풀이 시간 합계 오류');
  }
}
