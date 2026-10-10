import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fixture } from '../tests/fixtures/qf';
import { emptyData } from './model';
import { validateQFPackage, qfDigest, mergeQFPackages } from './qfImport';
import { startQF, actQF, gradeQF, summarizeQF } from './qfEngine';
import { validateStudyData, mergeStudyData, parseJSON } from './validation';
import { seedQuestions } from './seed';
import { act, createSession } from './sessionEngine';

function imported() { return { ...emptyData(), qfPackages: [validateQFPackage(fixture())] }; }

describe('QF 계약과 기록 보호', () => {
  it('네 형식과 원본 배열을 보존하고 Python digest와 일치한다', () => {
    const p = fixture(); const result = validateQFPackage(p);
    expect(result).toEqual(p);
    expect(qfDigest(p.questions[1].question)).toBe(p.questions[1].provenance.content_digest);
    expect(result.questions[1].question.options?.A).toEqual(['ㄴ', 'ㄱ']);
  });
  it('버전, READY, 검토, 목록, 개수, run, 본문 변경을 전량 거절한다', () => {
    const mutations = [
      (p: ReturnType<typeof fixture>) => { p.schema_version = 'next'; },
      (p: ReturnType<typeof fixture>) => { p.source_status = 'DRAFT'; },
      (p: ReturnType<typeof fixture>) => { p.questions[0].review_status = 'VERIFIED'; },
      (p: ReturnType<typeof fixture>) => { p.question_ids.reverse(); },
      (p: ReturnType<typeof fixture>) => { p.format_counts.MCQ++; },
      (p: ReturnType<typeof fixture>) => { p.questions[0].run_id = 'other'; },
      (p: ReturnType<typeof fixture>) => { p.questions[0].question.stem = '변경됨'; },
      (p: ReturnType<typeof fixture>) => { p.provenance.run_state.slots.q01.status = 'DRAFT'; },
    ];
    for (const mutate of mutations) { const p = fixture(); mutate(p); expect(() => validateQFPackage(p)).toThrow(); }
  });
  it('같은 패키지는 중복 없이 병합하고 충돌은 기존 기록을 보존한다', () => {
    const data = imported(); expect(mergeQFPackages(data.qfPackages, data.qfPackages)).toHaveLength(1);
    const changed = structuredClone(data.qfPackages); changed[0].questions[0].provenance.content_digest = 'f'.repeat(64);
    expect(() => mergeQFPackages(data.qfPackages, changed)).toThrow(/충돌/);
    expect(data.qfPackages[0].questions[0].provenance.content_digest).not.toBe('f'.repeat(64));
    expect(mergeStudyData(data, emptyData()).data.qfPackages).toEqual(data.qfPackages);
    expect(validateStudyData({ ...emptyData(), questions: seedQuestions })).toBeTruthy();
  });
});

describe('DAILY-15 풀이', () => {
  it('원순서 30분, 수정·재방문·확신도와 백업 복구, 자기 채점을 보존한다', () => {
    let d = startQF(imported(), 'test-run', 1000, 'session');
    const apply = (a: Parameters<typeof actQF>[2], t: number) => { d = actQF(d, 'session', a, t); validateStudyData(d); };
    expect(d.qfSessions![0].questionIds).toEqual(d.qfPackages![0].question_ids);
    apply({ type: 'choice', value: 'A' }, 1100);
    apply({ type: 'navigate', index: 6 }, 1200);
    apply({ type: 'text', value: ' 예시 답\n그대로 ' }, 1300);
    apply({ type: 'text', value: ' 수정한 답\n원문 ' }, 1400);
    apply({ type: 'confidence', value: 4 }, 1500);
    apply({ type: 'navigate', index: 0 }, 1600);
    expect(d.qfResponses![0].visitCount).toBe(2);
    expect(d.qfResponses![0].correct).toBeNull();
    d = validateStudyData(JSON.parse(JSON.stringify(d)));
    apply({ type: 'finish' }, 2000);
    const short = d.qfResponses![6];
    expect(short.textAnswer).toBe(' 수정한 답\n원문 ');
    expect(short.answerChangeCount).toBe(1);
    expect(short.correct).toBeNull();
    d = gradeQF(d, 'session', short.questionId, { selfGrade: 'PARTIAL', failureType: 'L' });
    validateStudyData(d);
    expect(summarizeQF(d).partial).toBe(1);
    expect(summarizeQF(d).autoCorrect).toBe(1);
    expect(summarizeQF(d).selfCorrect).toBe(0);
    expect(mergeStudyData(emptyData(), JSON.parse(JSON.stringify(d))).data).toEqual(d);
    expect(() => actQF(d, 'session', { type: 'text', value: '사후 변경' }, 2200)).toThrow();
  });
  it('백그라운드 경과 시간을 마감 시각으로 닫고 늦은 입력은 반영하지 않는다', () => {
    let d = startQF(imported(), 'test-run', 1000, 'session');
    d = actQF(d, 'session', { type: 'choice', value: 'A' }, 1801001);
    expect(d.qfSessions![0].endedAt).toBe(1801000);
    expect(d.qfResponses![0].selectedOption).toBeNull();
    expect(d.qfResponses![0].responseTimeMs).toBe(1800000);
    validateStudyData(d);
  });
  it('STANDARD-50 시작, 풀이 중 채점과 기존 세션 중 동시 시작을 막는다', () => {
    const d = { ...emptyData(), qfPackages: [validateQFPackage(fixture('standard50'))] };
    expect(() => startQF(d, 'test-run', 1, 's')).toThrow(/STANDARD-50/);
    const active = startQF(imported(), 'test-run', 1, 's');
    expect(() => gradeQF(active, 's', active.qfResponses![0].questionId, { selfGrade: 'CORRECT' })).toThrow();
    expect(() => startQF(active, 'test-run', 2, 's2')).toThrow();
  });
});

it.skipIf(!process.env.QF_EXPORT_PATH)('실제 비공개 export 계약과 저장 호환성', () => {
  const p = validateQFPackage(parseJSON(readFileSync(process.env.QF_EXPORT_PATH!, 'utf8')));
  expect(p.questions).toHaveLength(15);
  expect(p.format_counts).toEqual({ MCQ: 9, COMBINATION: 3, SHORT: 2, CONSTRUCTED_RESPONSE: 1 });
  const d = startQF({ ...emptyData(), qfPackages: [p] }, p.run_id, 1, 'real-test');
  validateStudyData(actQF(d, 'real-test', { type: 'finish' }, 2));
});

it('미방문 문항에는 풀이 확신도를 기록할 수 없다', () => {
  let d = startQF(imported(), 'test-run', 1, 'confidence-test');
  d = actQF(d, 'confidence-test', { type: 'finish' }, 2);
  expect(() => gradeQF(d, 'confidence-test', d.qfResponses![1].questionId, { confidence: 4 })).toThrow(/미방문/);
});

describe('Phase 5B 보완 회귀', () => {
  it('중복 JSON 키와 비유한 숫자는 조용히 바꾸지 않고 거절한다', () => {
    expect(() => parseJSON('{"source_status":"DRAFT","source_status":"READY"}')).toThrow();
    expect(() => parseJSON('{"a":1,"\\u0061":2}')).toThrow();
    expect(() => parseJSON('{"provenance":{"value":1e400}}')).toThrow();
    expect(parseJSON('{"a":[{"a":1},{"a":2}],"text":"{\\\"a\\\":1}"}')).toEqual({ a: [{ a: 1 }, { a: 2 }], text: '{"a":1}' });
  });
  it.each(['MCQ', 'COMBINATION'])('%s 중복 선택지는 digest가 맞아도 거절한다', format => {
    const p = fixture(), w = p.questions[format === 'MCQ' ? 0 : 1];
    if (format === 'MCQ') w.question.options = { A: ' Ａ B ', B: 'ab' };
    else {
      Object.assign(w.question.options as object, { C: ['ㄷ'] });
      Object.assign(w.question.distractor_rationales as object, { C: '합성 설명' });
      w.provenance.review.review.option_checks.C = { correct: false, reason: '합성 설명' };
      w.provenance.review.review.distractor_discrimination.C = { temptation: '합성 유인', elimination: '합성 배제', requires_interpretation: false };
    }
    const digest = qfDigest(w.question);
    w.provenance.content_digest = digest;
    Object.assign(w.question.validation as object, { review_digest: digest });
    w.provenance.review.review.content_digest = digest; w.provenance.blind.content_digest = digest;
    p.provenance.manifest.questions[format === 'MCQ' ? 0 : 1].content_digest = digest;
    expect(() => validateQFPackage(p)).toThrow();
  });
  it.each(['hash', 'english', 'review', 'fields', 'formats'])('%s 계약 위반을 전량 거절한다', defect => {
    const p = fixture();
    if (defect === 'hash') delete p.provenance.source_file_sha256['questions/q01.json'];
    if (defect === 'english') p.questions[14].provenance.review.english!.english_review.korean_paraphrase = '';
    if (defect === 'review') p.questions[0].provenance.review.review.option_checks.A.correct = false;
    if (defect === 'fields') Object.assign(p, { unsupported: {} });
    if (defect === 'formats') {
      // Valid digests and reviews, but the daily15 quota is no longer 9/3/2/1.
      const replacement = structuredClone(p.questions[0]);
      replacement.id = p.questions[1].id;
      replacement.question.question_id = 'q02';
      replacement.provenance.source_file = 'questions/q02.json';
      replacement.provenance.blueprint = { ...replacement.question };
      const d = qfDigest(replacement.question);
      replacement.provenance.content_digest = d;
      Object.assign(replacement.question.validation as object, { review_digest: d });
      Object.assign(replacement.provenance.review.review, { question_id: 'q02', content_digest: d });
      Object.assign(replacement.provenance.blind, { question_id: 'q02', content_digest: d });
      p.questions[1] = replacement;
      p.provenance.manifest.questions[1].content_digest = d;
      p.format_counts.MCQ++; p.format_counts.COMBINATION--;
    }
    expect(() => validateQFPackage(p)).toThrow();
  });
  it('Later/Skip은 답안을 보존하며 이동하고 재방문 후 해제할 수 있다', () => {
    let d = startQF(imported(), 'test-run', 1000, 'triage');
    d = actQF(d, 'triage', { type: 'choice', value: 'A' }, 1100);
    d = actQF(d, 'triage', { type: 'triage', value: 'LATER' }, 1200);
    expect(d.qfSessions![0].cursor).toBe(1);
    expect(d.qfResponses![0]).toMatchObject({ selectedOption: 'A', triage: 'LATER', responseTimeMs: 200 });
    d = actQF(d, 'triage', { type: 'triage', value: 'SKIP' }, 1300);
    expect(d.qfResponses![1].triage).toBe('SKIP');
    d = validateStudyData(JSON.parse(JSON.stringify(d)));
    d = actQF(d, 'triage', { type: 'navigate', index: 0 }, 1400);
    d = actQF(d, 'triage', { type: 'triage', value: null }, 1500);
    expect(d.qfSessions![0].cursor).toBe(0);
    expect(d.qfResponses![0].triage).toBeNull();
  });
  it('기준별 확인과 부분 정답을 백업하며 미채점·미응답을 정답률에서 구분한다', () => {
    let d = startQF(imported(), 'test-run', 1000, 'rubric');
    const qid = d.qfResponses![6].questionId;
    expect(() => gradeQF(d, 'rubric', qid, { rubricChecks: [true] })).toThrow();
    d = actQF(d, 'rubric', { type: 'choice', value: 'A' }, 1100);
    d = actQF(d, 'rubric', { type: 'navigate', index: 1 }, 1200);
    d = actQF(d, 'rubric', { type: 'choice', value: 'B' }, 1300);
    d = actQF(d, 'rubric', { type: 'navigate', index: 6 }, 1400);
    d = actQF(d, 'rubric', { type: 'text', value: '다른 말로 쓴 답' }, 1500);
    d = actQF(d, 'rubric', { type: 'navigate', index: 14 }, 1600);
    d = actQF(d, 'rubric', { type: 'text', value: 'long\nanswer' }, 1700);
    d = actQF(d, 'rubric', { type: 'finish' }, 1800);
    d = gradeQF(d, 'rubric', qid, { rubricChecks: [true], selfGrade: 'PARTIAL', failureType: 'L' });
    expect(d.qfResponses![6]).toMatchObject({ rubricChecks: [true], correct: null, selfGrade: 'PARTIAL' });
    expect(summarizeQF(d)).toMatchObject({ autoCorrect: 1, autoWrong: 1, autoGraded: 2, selfGraded: 1, selfCorrect: 0, partial: 1, ungraded: 1, unanswered: 11 });
    expect(validateStudyData(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(mergeStudyData(emptyData(), d).data).toEqual(d);
    expect(() => gradeQF(d, 'rubric', qid, { rubricChecks: [] })).toThrow();
    expect(() => gradeQF(d, 'rubric', d.qfResponses![0].questionId, { rubricChecks: [] })).toThrow();
    const invalid = structuredClone(d); invalid.qfResponses![6].rubricChecks = [true, false];
    expect(() => validateStudyData(invalid)).toThrow();
  });
  it('기존 v0.2 기록과 이전 QF 백업은 새 선택 필드 없이도 읽고 충돌은 원자적으로 거절한다', () => {
    let legacy = createSession({ ...emptyData(), questions: seedQuestions }, { mode: 'RECALL', count: 1, timeLimitSec: 60, includeDrafts: true }, 1000, 'legacy');
    legacy = act(legacy, 'legacy', { type: 'submit', answer: 0 }, 1100);
    legacy = act(legacy, 'legacy', { type: 'finish' }, 1200);
    let d = mergeStudyData(legacy, imported()).data;
    d = startQF(d, 'test-run', 2000, 'old-qf');
    d = actQF(d, 'old-qf', { type: 'finish' }, 2100);
    for (const row of d.qfResponses!) { delete row.triage; delete row.rubricChecks; }
    expect(validateStudyData(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(d.sessions).toEqual(legacy.sessions); expect(d.responses).toEqual(legacy.responses);
    const before = JSON.stringify(d), changed = structuredClone(d);
    changed.qfResponses![0].confidence = 3;
    expect(() => mergeStudyData(d, changed)).toThrow(/충돌/);
    expect(JSON.stringify(d)).toBe(before);
  });
});
