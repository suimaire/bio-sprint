import { validateQFData } from './qfValidation';
import { mergeQFPackages } from './qfImport';
import { CONTEXT_NOVELTIES, FAILURES, LANGUAGES, MODES, SOURCES, STIMULUS_TYPES, TAXONOMY, type Question, type Session, type StudyData } from './model';

export class ValidationError extends Error {
  constructor(public issues: string[]) { super(issues.join('\n')); this.name = 'ValidationError'; }
}
type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const id = (v: unknown, max = 128) => text(v, max) && v === v.trim();
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const time = (v: unknown) => integer(v, 0, 8640000000000000);
const oneOf = (v: unknown, allowed: readonly string[]) => typeof v === 'string' && allowed.includes(v);
const triage = ['SOLVE', 'LATER', 'SKIP'];
function checkQuestions(value: unknown, errors: string[], prefix = 'questions'): value is Question[] {
  if (!Array.isArray(value) || value.length > 50000) { errors.push(`${prefix}: 최대 50,000개의 문제 배열이 필요합니다.`); return false; }
  const seen = new Set<string>();
  value.forEach((q, i) => {
    const p = `${prefix}[${i}]`;
    if (!object(q)) { errors.push(`${p}: 객체가 필요합니다.`); return; }
    const check = (ok: boolean, field: string, reason: string) => { if (!ok) errors.push(`${p}.${field}: ${reason}`); };
    check(id(q.id), 'id', '앞뒤 공백 없는 1–128자 문자열이 필요합니다.');
    if (typeof q.id === 'string') { if (seen.has(q.id)) errors.push(`${p}.id: 중복 ID '${q.id}'`); seen.add(q.id); }
    check(oneOf(q.mode, MODES), 'mode', 'RECALL / INTERPRET / DEEP 중 하나를 사용하세요.');
    check(oneOf(q.domain, Object.keys(TAXONOMY)), 'domain', '정의된 생물학 domain을 사용하세요.');
    check(text(q.subdomain, 200), 'subdomain', '비어 있지 않은 문자열이 필요합니다.');
    check(integer(q.difficulty, 1, 5), 'difficulty', '1–5 정수가 필요합니다.');
    check(oneOf(q.sourceType, SOURCES), 'sourceType', 'VERIFIED / REVIEWED / DRAFT 중 하나를 사용하세요.');
    check(text(q.question), 'question', '문제 본문이 필요합니다.');
    const choicesOK = Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 9 && q.choices.every(c => text(c, 5000));
    check(choicesOK, 'choices', '2–9개의 비어 있지 않은 보기 문자열이 필요합니다.');
    check(choicesOK && integer(q.answer, 0, (q.choices as unknown[]).length - 1), 'answer', '보기 범위 안의 0부터 시작하는 정수 인덱스가 필요합니다.');
    check(text(q.explanation), 'explanation', '해설이 필요합니다.');
    check(Array.isArray(q.tags) && q.tags.length <= 50 && q.tags.every(t => text(t, 200)), 'tags', '문자열 배열이 필요합니다 (최대 50개).');
    check(integer(q.targetTimeSec, 1, 3600), 'targetTimeSec', '1–3600초 정수가 필요합니다.');
    check(q.fixture === undefined || typeof q.fixture === 'boolean', 'fixture', 'boolean이어야 합니다.');
    check(q.language === undefined || oneOf(q.language, LANGUAGES), 'language', 'KO / EN을 사용하세요.');
    check(q.stimulusType === undefined || oneOf(q.stimulusType, STIMULUS_TYPES), 'stimulusType', '지원하는 자극 유형을 사용하세요.');
    check(q.contextNovelty === undefined || oneOf(q.contextNovelty, CONTEXT_NOVELTIES), 'contextNovelty', 'STANDARD / TRANSFER를 사용하세요.');
  });
  return errors.length === 0;
}
export function validateQuestionBank(value: unknown): Question[] {
  const errors: string[] = [];
  checkQuestions(value, errors);
  if (errors.length) throw new ValidationError(errors);
  return value as Question[];
}
export function validateStudyData(value: unknown): StudyData {
  const errors: string[] = [];
  if (!object(value)) throw new ValidationError(['최상위 JSON 객체가 필요합니다.']);
  if (value.schemaVersion !== 1) errors.push('schemaVersion: 지원하는 버전은 1입니다.');
  checkQuestions(value.questions, errors);
  if (!Array.isArray(value.sessions)) errors.push('sessions: 배열이 필요합니다.');
  if (!Array.isArray(value.responses)) errors.push('responses: 배열이 필요합니다.');
  if (errors.length) throw new ValidationError(errors);
  const questions = value.questions as Question[];
  const sessions = value.sessions as unknown[];
  const responses = value.responses as unknown[];
  const bank = new Map(questions.map(q => [q.id, q]));
  const sessionIds = new Set<string>();
  const responseIds = new Set<string>();
  let activeCount = 0;
  const check = (ok: boolean, path: string, reason: string) => { if (!ok) errors.push(`${path}: ${reason}`); };
  sessions.forEach((s, i) => {
    const p = `sessions[${i}]`;
    if (!object(s)) { errors.push(`${p}: 객체가 필요합니다.`); return; }
    check(id(s.id), `${p}.id`, '유효한 ID가 필요합니다.');
    if (typeof s.id === 'string') { check(!sessionIds.has(s.id), `${p}.id`, '중복 ID입니다.'); sessionIds.add(s.id); }
    check(oneOf(s.mode, [...MODES, 'MIXED', 'REAL_EXAM']), `${p}.mode`, '지원하지 않는 모드입니다.');
    check(oneOf(s.status, ['ACTIVE', 'COMPLETED']), `${p}.status`, 'ACTIVE / COMPLETED가 필요합니다.');
    check(time(s.startedAt), `${p}.startedAt`, '유효한 밀리초 타임스탬프가 필요합니다.');
    check(integer(s.timeLimitSec, 1, 86400), `${p}.timeLimitSec`, '1–86400초 정수가 필요합니다.');
    check(typeof s.includeDrafts === 'boolean', `${p}.includeDrafts`, 'boolean이 필요합니다.');
    const idsOK = Array.isArray(s.questionIds) && s.questionIds.length > 0 && s.questionIds.length <= 100 && s.questionIds.every(x => typeof x === 'string' && bank.has(x)) && new Set(s.questionIds).size === s.questionIds.length;
    check(idsOK, `${p}.questionIds`, '중복 없는 기존 문제 ID 배열이 필요합니다 (1–100개).');
    if (idsOK) {
      const ids = s.questionIds as string[];
      check(ids.every(id => s.mode === 'MIXED' || s.mode === 'REAL_EXAM' || bank.get(id)!.mode === s.mode), `${p}.mode`, '문제 모드와 일치하지 않습니다.');
      check(s.includeDrafts === true || ids.every(id => bank.get(id)!.sourceType !== 'DRAFT'), `${p}.includeDrafts`, 'DRAFT 문제에는 명시적 포함이 필요합니다.');
      const queueOK = Array.isArray(s.queue) && s.queue.length >= ids.length && s.queue.length <= ids.length * 2 && s.queue.every(x => ids.includes(x)) && ids.every((id, j) => (s.queue as unknown[])[j] === id) && new Set(s.queue.slice(ids.length)).size === s.queue.length - ids.length;
      check(queueOK, `${p}.queue`, '원래 문제 순서와 최대 1회 재방문 규칙을 확인하세요.');
      if (s.mode === 'REAL_EXAM') check(JSON.stringify(s.queue) === JSON.stringify(ids), `${p}.queue`, '시험 문항은 중복 없이 고정됩니다.');
      check(Array.isArray(s.queue) && integer(s.cursor, 0, s.queue.length - (s.status === 'ACTIVE' ? 1 : 0)), `${p}.cursor`, '대기열 범위 밖입니다.');
    }
    if (s.status === 'ACTIVE') { activeCount++; check(s.endedAt === null, `${p}.endedAt`, '진행 중에는 null이어야 합니다.'); }
    else check(time(s.endedAt) && time(s.startedAt) && (s.endedAt as number) >= (s.startedAt as number) && (s.endedAt as number) <= (s.startedAt as number) + (s.timeLimitSec as number) * 1000, `${p}.endedAt`, '시작 이후, 제한 시간 이내의 종료 시각이 필요합니다.');
    if (s.mode === 'REAL_EXAM') {
      check(s.status === 'ACTIVE' ? s.endReason === undefined : oneOf(s.endReason, ['SUBMITTED', 'EXPIRED']), `${p}.endReason`, '종료 사유를 확인하세요.');
      if (s.endReason === 'EXPIRED') check(s.endedAt === (s.startedAt as number) + (s.timeLimitSec as number) * 1000, `${p}.endedAt`, '만료 시각은 원래 마감 시각입니다.');
    }
  });
  check(activeCount <= 1, 'sessions', '진행 중인 세션은 하나만 허용됩니다.');
  if (errors.length) throw new ValidationError(errors);
  const typedSessions = value.sessions as StudyData['sessions'];
  const pairs = new Set<string>();
  responses.forEach((r, i) => {
    const p = `responses[${i}]`;
    if (!object(r)) { errors.push(`${p}: 객체가 필요합니다.`); return; }
    check(id(r.id, 257), `${p}.id`, '앞뒤 공백 없는 1–257자 ID가 필요합니다.');
    if (typeof r.id === 'string') { check(!responseIds.has(r.id), `${p}.id`, '중복 ID입니다.'); responseIds.add(r.id); }
    const s = typedSessions.find(s => s.id === r.sessionId);
    const q = typeof r.questionId === 'string' ? bank.get(r.questionId) : undefined;
    check(!!s && !!q && s.questionIds.includes(q.id), p, 'sessionId / questionId 참조를 확인하세요.');
    const pair = JSON.stringify([r.sessionId, r.questionId]);
    check(!pairs.has(pair), p, '동일 세션/문제 응답이 중복됩니다.'); pairs.add(pair);
    check(oneOf(r.outcome, ['PENDING', 'ANSWERED', 'SKIPPED', 'UNREACHED']), `${p}.outcome`, '지원하지 않는 결과입니다.');
    check(r.confidence === null || integer(r.confidence, 1, 5), `${p}.confidence`, 'null 또는 1–5 정수가 필요합니다.');
    check(r.failureType === null || oneOf(r.failureType, Object.keys(FAILURES)), `${p}.failureType`, 'null 또는 K/R/T/C/S/L이 필요합니다.');
    check(integer(r.responseTimeMs), `${p}.responseTimeMs`, '0 이상의 정수 밀리초가 필요합니다.');
    check(integer(r.visitCount, 0, s?.mode === 'REAL_EXAM' ? Number.MAX_SAFE_INTEGER : 2), `${p}.visitCount`, '유효한 방문 횟수가 필요합니다.');
    check(typeof r.revisited === 'boolean' && r.revisited === ((r.visitCount as number) > 1), `${p}.revisited`, '방문 횟수와 일치하는 boolean이 필요합니다.');
    for (const f of ['shownAt', 'answeredAt', 'lastShownAt']) check(r[f] === null || time(r[f]), `${p}.${f}`, 'null 또는 밀리초 타임스탬프가 필요합니다.');
    check(r.firstDecision === null || oneOf(r.firstDecision, triage), `${p}.firstDecision`, 'SOLVE/LATER/SKIP 또는 null이 필요합니다.');
    const decisionsOK = Array.isArray(r.decisions) && r.decisions.every(d => object(d) && oneOf(d.decision, triage) && time(d.at));
    check(decisionsOK, `${p}.decisions`, 'decision과 at이 포함된 배열이 필요합니다.');
    if (decisionsOK) {
      const ds = r.decisions as { decision: string; at: number }[];
      check(r.firstDecision === (ds[0]?.decision ?? null), `${p}.firstDecision`, '첫 선택 기록과 일치하지 않습니다.');
      check(ds.every((d, j) => d.at >= (r.shownAt as number) && (!j || d.at >= ds[j - 1].at) && (!s || d.at <= s.startedAt + s.timeLimitSec * 1000)), `${p}.decisions`, '선택 시각 순서와 세션 시간 범위를 확인하세요.');
      check(s?.mode === 'REAL_EXAM' || ds.filter(d => d.decision === 'LATER').length <= 1, `${p}.decisions`, 'Training LATER는 문제당 한 번만 허용됩니다.');
      check(s?.mode === 'MIXED' || s?.mode === 'REAL_EXAM' || ds.every(d => d.decision === 'SOLVE'), `${p}.decisions`, 'LATER/SKIP 판단은 MIXED 또는 REAL EXAM에서 가능합니다.');
    }
    if (s?.mode === 'REAL_EXAM' && q) { checkExamResponse(r, s, q, p, check); return; }
    if (r.outcome === 'ANSWERED') {
      check(!!q && integer(r.selectedAnswer, 0, q.choices.length - 1), `${p}.selectedAnswer`, '유효한 보기 인덱스가 필요합니다.');
      check(typeof r.correct === 'boolean' && r.correct === (r.selectedAnswer === q?.answer), `${p}.correct`, '정답과 일치하지 않습니다.');
      check(time(r.answeredAt) && time(r.shownAt) && (r.answeredAt as number) >= (r.shownAt as number), `${p}.answeredAt`, '표시 시각 이후 제출 시각이 필요합니다.');
      check(!r.correct || r.failureType === null, `${p}.failureType`, '정답에는 오답 원인이 없어야 합니다.');
    } else {
      check(r.selectedAnswer === null && r.correct === null && r.answeredAt === null && r.confidence === null && r.failureType === null, p, '미응답에는 답안/정오/확신도/오답 원인을 기록할 수 없습니다.');
    }
    check(r.outcome === 'PENDING' || r.lastShownAt === null, `${p}.lastShownAt`, '처리된 문제의 타이머는 닫혀 있어야 합니다.');
    check(r.shownAt === null ? r.visitCount === 0 && r.responseTimeMs === 0 && r.firstDecision === null : (r.visitCount as number) >= 1, p, '표시 시각과 방문 횟수가 일치하지 않습니다.');
    check(r.outcome !== 'UNREACHED' || r.shownAt === null, p, 'UNREACHED에는 표시 시각이 없어야 합니다.');
    if (s) {
      const end = s.endedAt ?? s.startedAt + s.timeLimitSec * 1000;
      for (const field of ['shownAt', 'answeredAt', 'lastShownAt']) if (r[field] !== null) check(time(r[field]) && (r[field] as number) >= s.startedAt && (r[field] as number) <= end, `${p}.${field}`, '세션 시간 범위 밖입니다.');
      check((r.responseTimeMs as number) <= s.timeLimitSec * 1000, `${p}.responseTimeMs`, '세션 제한 시간을 초과합니다.');
      check(s.status !== 'COMPLETED' || r.outcome !== 'PENDING', `${p}.outcome`, '종료된 세션에 PENDING이 있습니다.');
      if (r.lastShownAt !== null) {
        check(s.status === 'ACTIVE' && r.questionId === s.queue[s.cursor] && r.outcome === 'PENDING', `${p}.lastShownAt`, '현재 문제만 열린 타이머를 가질 수 있습니다.');
        check(time(r.shownAt) && time(r.lastShownAt) && (r.lastShownAt as number) >= (r.shownAt as number), `${p}.lastShownAt`, '열린 방문은 최초 shownAt 이후여야 합니다.');
      }
      const expectedVisits = s.queue.slice(0, s.cursor + 1).filter(qid => qid === r.questionId).length;
      check(r.visitCount === expectedVisits, `${p}.visitCount`, '대기열 진행과 방문 횟수가 일치하지 않습니다.');
      if (time(r.shownAt)) {
        const decisions = decisionsOK ? r.decisions as { at: number }[] : [];
        const spanEnd = r.answeredAt ?? r.lastShownAt ?? s.endedAt ?? decisions.at(-1)?.at ?? s.startedAt;
        check((r.responseTimeMs as number) <= (spanEnd as number) - (r.shownAt as number), `${p}.responseTimeMs`, '기록된 방문 시간 범위를 초과합니다.');
      }
      if (s.status === 'ACTIVE' && r.questionId === s.queue[s.cursor]) check(r.outcome === 'ANSWERED' || (r.outcome === 'PENDING' && r.lastShownAt !== null), p, '현재 문제는 풀이 또는 피드백 상태여야 합니다.');
    }
  });
  for (const s of typedSessions) for (const qid of s.questionIds) check(pairs.has(JSON.stringify([s.id, qid])), `sessions[${s.id}]`, `문제 ${qid}의 응답 레코드가 없습니다.`);
  if (errors.length) throw new ValidationError(errors);
  const typedResponses = value.responses as StudyData['responses'];
  for (const s of typedSessions) {
    const rows = typedResponses.filter(r => r.sessionId === s.id);
    const later = s.questionIds.filter(id => rows.find(r => r.questionId === id)!.decisions.some(d => d.decision === 'LATER'));
    if (s.mode !== 'REAL_EXAM') check(JSON.stringify(s.queue.slice(s.questionIds.length)) === JSON.stringify(later), `sessions[${s.id}].queue`, 'LATER 판단에 해당하는 재방문 대기열이 정확히 한 번씩 필요합니다.');
    check(rows.reduce((sum, r) => sum + r.responseTimeMs, 0) <= s.timeLimitSec * 1000, `sessions[${s.id}].responseTimeMs`, '문제 시간 합계가 세션 제한 시간을 초과합니다.');
  }
  if (errors.length) throw new ValidationError(errors);
  validateQFData(value);
  return value as unknown as StudyData;
}

function checkExamResponse(r: RecordValue, s: Session, q: Question, p: string, check: (ok: boolean, path: string, reason: string) => void) {
  const end = s.endedAt ?? s.startedAt + s.timeLimitSec * 1000;
  const selected = r.selectedAnswer !== null;
  check(!selected || integer(r.selectedAnswer, 0, q.choices.length - 1), `${p}.selectedAnswer`, '유효한 보기 인덱스가 필요합니다.');
  for (const f of ['shownAt', 'answeredAt', 'lastShownAt', 'firstAnsweredAt', 'finalResponseAt']) {
    check(r[f] === null || (time(r[f]) && (r[f] as number) >= s.startedAt && (r[f] as number) <= end && (f === 'shownAt' || (time(r.shownAt) && (r[f] as number) >= (r.shownAt as number)))), `${p}.${f}`, '세션/표시 시각 범위 안의 시각 또는 null이 필요합니다.');
  }
  check(integer(r.answerChangeCount), `${p}.answerChangeCount`, '0 이상의 정수가 필요합니다.');
  check(selected ? time(r.answeredAt) && time(r.firstAnsweredAt) && (r.firstAnsweredAt as number) <= (r.answeredAt as number) : r.answeredAt === null, `${p}.answeredAt`, '최초/최종 답안 시각을 확인하세요.');
  check(r.firstAnsweredAt !== null || (!selected && r.answerChangeCount === 0), `${p}.firstAnsweredAt`, '답안 변경에는 최초 답안 시각이 필요합니다.');
  check(r.answeredAt === null || (time(r.finalResponseAt) && (r.finalResponseAt as number) >= (r.answeredAt as number)), `${p}.finalResponseAt`, '마지막 답안 이후 시각이 필요합니다.');
  check(r.shownAt === null ? r.visitCount === 0 && r.responseTimeMs === 0 && r.firstDecision === null && r.finalResponseAt === null : (r.visitCount as number) >= 1, `${p}.visitCount`, '표시 시각과 방문 횟수를 확인하세요.');
  const ds = Array.isArray(r.decisions) ? r.decisions : [];
  check(ds.every(d => object(d) && (d.at as number) <= end && time(r.finalResponseAt) && (d.at as number) <= (r.finalResponseAt as number)), `${p}.decisions`, '최종 응답/종료 이후 판단이 있습니다.');
  check((r.responseTimeMs as number) <= end - ((r.shownAt as number | null) ?? end), `${p}.responseTimeMs`, '방문 가능한 시간을 초과합니다.');
  if (s.status === 'ACTIVE') {
    check(r.outcome === 'PENDING' && r.correct === null && r.confidence === null && r.failureType === null, p, '시험 중에는 채점/피드백이 없습니다.');
    check(r.questionId === s.questionIds[s.cursor] ? time(r.lastShownAt) : r.lastShownAt === null, `${p}.lastShownAt`, '현재 문제만 열린 타이머를 가집니다.');
  } else {
    check(r.outcome === (selected ? 'ANSWERED' : r.shownAt === null ? 'UNREACHED' : 'SKIPPED'), `${p}.outcome`, '최종 답안과 결과가 일치하지 않습니다.');
    check(r.correct === (selected ? r.selectedAnswer === q.answer : null), `${p}.correct`, '최종 답안 채점이 일치하지 않습니다.');
    check(r.lastShownAt === null, `${p}.lastShownAt`, '종료된 시험은 타이머가 닫혀야 합니다.');
    check(r.correct !== true || r.failureType === null, `${p}.failureType`, '정답에는 오답 원인이 없습니다.');
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function mergeStudyData(current: StudyData, incoming: StudyData) {
  validateStudyData(incoming);
  const merge = <T extends { id: string }>(old: T[], added: T[], label: string): T[] => {
    const map = new Map(old.map(v => [v.id, v]));
    for (const v of added) {
      const existing = map.get(v.id);
      if (existing && canonical(existing) !== canonical(v)) throw new ValidationError([`${label}.${v.id}: ID 충돌 — 기존 데이터와 내용이 다릅니다. 원본을 보존했습니다. 새 ID를 사용하거나 별도 브라우저에 가져오세요.`]);
      if (!existing) map.set(v.id, v);
    }
    return [...map.values()];
  };
  const data: StudyData = { schemaVersion: 1, questions: merge(current.questions, incoming.questions, 'questions'), sessions: merge(current.sessions, incoming.sessions, 'sessions'), responses: merge(current.responses, incoming.responses, 'responses') };
  if (current.qfPackages || incoming.qfPackages) data.qfPackages = mergeQFPackages(current.qfPackages, incoming.qfPackages);
  if (current.qfSessions || incoming.qfSessions) data.qfSessions = merge(current.qfSessions ?? [], incoming.qfSessions ?? [], 'qfSessions');
  if (current.qfResponses || incoming.qfResponses) data.qfResponses = merge(current.qfResponses ?? [], incoming.qfResponses ?? [], 'qfResponses');
  validateStudyData(data);
  return { data, summary: { questions: data.questions.length - current.questions.length, sessions: data.sessions.length - current.sessions.length, responses: data.responses.length - current.responses.length } };
}
export function parseJSON(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text, (_, v: unknown) => {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Nonfinite JSON number');
      return v;
    });
  } catch { throw new ValidationError(['JSON 문법 또는 숫자 오류: UTF-8 JSON과 유한한 숫자가 필요합니다.']); }
  // Syntax is already checked above. Scan object keys before accepting the
  // parsed value: JSON.parse otherwise silently discards duplicate properties.
  const stack: ({ keys: Set<string>; key: boolean } | null)[] = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)) {
    const token = match[0], current = stack.at(-1);
    if (token === '{') stack.push({ keys: new Set(), key: true });
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && current) current.key = true;
    else if (token.startsWith('"') && current?.key) {
      const key = JSON.parse(token) as string;
      if (current.keys.has(key)) throw new ValidationError(['중복 JSON 키가 있습니다. 전체 가져오기를 거절했습니다.']);
      current.keys.add(key); current.key = false;
    }
  }
  return value;
}
