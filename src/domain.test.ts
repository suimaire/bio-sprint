import { describe, expect, it } from 'vitest';
import { emptyData, type Question, type Response } from './model';
import { aggregate, classifyTime, daysUntilExam, diagnosticFlags, groupStats, reviewPriority, reviewQueue, timeLeaks } from './metrics';
import { mergeStudyData, validateQuestionBank, validateStudyData } from './validation';
import { act, createSession, eligibleQuestions } from './sessionEngine';
import { seedQuestions } from './seed';

export const q: Question = { id: 'q1', mode: 'RECALL', domain: 'Genetics', subdomain: '멘델 유전', difficulty: 2, sourceType: 'REVIEWED', question: 'Aa × Aa에서 aa 확률은?', choices: ['1/4', '1/2', '3/4', '1'], answer: 0, explanation: '분리 법칙에 따라 1/4이다.', tags: ['확률'], targetTimeSec: 20 };
const t = Date.parse('2026-10-04T00:00:00Z');
const config = { mode: 'MIXED' as const, count: 2, timeLimitSec: 300, includeDrafts: false };
const start = () => createSession({ ...emptyData(), questions: [q, { ...q, id: 'q2' }] }, config, t, 's1');
const result = (overrides: Partial<Response> = {}): Response => ({ id: 's1:q1', sessionId: 's1', questionId: 'q1', outcome: 'ANSWERED', selectedAnswer: 1, correct: false, confidence: 5, failureType: 'K', shownAt: t, answeredAt: t + 40000, lastShownAt: null, responseTimeMs: 40000, firstDecision: 'SOLVE', decisions: [{ decision: 'SOLVE', at: t }], visitCount: 1, revisited: false, ...overrides });

describe('question and study validation', () => {
  it('validates every seed while preserving its unverified fixture status', () => {
    expect(validateQuestionBank(seedQuestions)).toHaveLength(27);
    expect(seedQuestions.every(q => q.sourceType === 'DRAFT' && q.fixture)).toBe(true);
    expect(new Set(seedQuestions.map(q => q.domain)).size).toBe(11);
    for (const mode of ['RECALL', 'INTERPRET', 'DEEP']) expect(seedQuestions.filter(q => q.mode === mode)).toHaveLength(9);
  });
  it('accepts the typed schema and rejects missing fields with a path', () => {
    expect(validateQuestionBank([q])).toEqual([q]);
    expect(() => validateQuestionBank([{ ...q, explanation: '' }])).toThrow(/explanation/);
  });
  it.each([{ answer: 4 }, { difficulty: 0 }, { targetTimeSec: -1 }, { domain: 'Unknown' }, { mode: 'MIXED' }, { sourceType: 'AI_VERIFIED' }, { choices: ['only'] }, { tags: [3] }, { fixture: 'yes' }])('rejects malformed fields %j', bad => {
    expect(() => validateQuestionBank([{ ...q, ...bad }])).toThrow();
  });
  it('detects duplicate IDs, including trimmed IDs', () => {
    expect(() => validateQuestionBank([q, q])).toThrow(/중복/);
    expect(() => validateQuestionBank([{ ...q, id: ' q1 ' }])).toThrow(/id/);
  });
  it('round-trips real completed sessions and checks response references and correctness', () => {
    let d = start();
    d = act(d, 's1', { type: 'submit', answer: 1 }, t + 10000);
    d = act(d, 's1', { type: 'reflect', confidence: 5, failureType: 'K' }, t + 12000);
    d = act(d, 's1', { type: 'finish' }, t + 13000);
    expect(validateStudyData(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(() => validateStudyData({ ...d, schemaVersion: 2 })).toThrow(/schemaVersion/);
    expect(() => validateStudyData({ ...d, responses: [{ ...d.responses[0], questionId: 'missing' }, d.responses[1]] })).toThrow();
    expect(() => validateStudyData({ ...d, responses: [{ ...d.responses[0], correct: true }, d.responses[1]] })).toThrow(/correct/);
  });
  it('rejects invalid times, confidence, failure codes, queues, and duplicate session records', () => {
    const d = start();
    for (const changes of [{ confidence: 6 }, { failureType: 'X' }, { responseTimeMs: -1 }, { shownAt: 'now' }, { revisited: 'true' }]) {
      expect(() => validateStudyData({ ...d, responses: [{ ...d.responses[0], ...changes }, d.responses[1]] })).toThrow();
    }
    expect(() => validateStudyData({ ...d, sessions: [d.sessions[0], d.sessions[0]] })).toThrow();
    expect(() => validateStudyData({ ...d, sessions: [{ ...d.sessions[0], queue: ['missing'] }] })).toThrow();
  });
  it('merges non-destructively and rejects conflicting identical IDs', () => {
    const d = start();
    expect(mergeStudyData(d, d).summary.questions).toBe(0);
    expect(mergeStudyData(d, { ...emptyData(), questions: [{ ...q, id: 'q3' }] }).data.questions).toHaveLength(3);
    expect(() => mergeStudyData(d, { ...emptyData(), questions: [{ ...q, question: 'Changed' }] })).toThrow(/충돌/);
    const reordered = { ...q, choices: [...q.choices] };
    expect(mergeStudyData(d, { ...emptyData(), questions: [reordered] }).summary.questions).toBe(0);
  });
  it('rejects an open visit without its first display timestamp', () => {
    const d = start();
    d.responses[0].shownAt = null;
    d.responses[0].visitCount = 0;
    expect(() => validateStudyData(d)).toThrow(/shownAt|lastShownAt/);
  });
  it('rejects a deferred queue that drops the recorded Later revisit', () => {
    const d = act(start(), 's1', { type: 'later' }, t + 1000);
    d.sessions[0].queue.pop();
    expect(() => validateStudyData(d)).toThrow(/queue/);
  });
  it('rejects impossible visit counts, cumulative response times, and unordered visit timestamps', () => {
    const started = start();
    started.responses[0].visitCount = 2;
    started.responses[0].revisited = true;
    expect(() => validateStudyData(started)).toThrow(/visitCount/);
    const answered = act(start(), 's1', { type: 'submit', answer: 0 }, t + 1000);
    answered.responses[0].responseTimeMs = 2000;
    expect(() => validateStudyData(answered)).toThrow(/responseTimeMs/);
    const later = act(act(start(), 's1', { type: 'later' }, t + 1000), 's1', { type: 'skip' }, t + 2000);
    later.responses[0].lastShownAt = t - 1;
    expect(() => validateStudyData(later)).toThrow(/lastShownAt/);
  });
});

describe('timing and diagnostics', () => {
  it('uses question-specific thresholds with exact boundaries', () => {
    expect(classifyTime(14999, 20)).toBe('FAST');
    expect(classifyTime(15000, 20)).toBe('NORMAL');
    expect(classifyTime(30000, 20)).toBe('NORMAL');
    expect(classifyTime(30001, 20)).toBe('SLOW');
    expect(classifyTime(40000, 90)).toBe('FAST');
  });
  it('diagnoses easy misses, high confidence wrongs and excessive investment', () => {
    expect(diagnosticFlags(q, result({ responseTimeMs: 50000 }))).toEqual(['EASY_MISS', 'LONG_WRONG', 'MISCONCEPTION_CANDIDATE', 'BAD_INVESTMENT']);
    expect(diagnosticFlags(q, result({ correct: true, selectedAnswer: 0 }))).toEqual(['SLOW_CORRECT']);
    expect(diagnosticFlags(q, result({ outcome: 'UNREACHED', correct: null, responseTimeMs: 0 }))).toEqual([]);
  });
  it('uses Seoul calendar dates including exam day and post-exam', () => {
    expect(daysUntilExam(new Date('2026-10-04T00:00:00+09:00'))).toBe(41);
    expect(daysUntilExam(new Date('2026-11-13T15:01:00Z'))).toBe(0);
    expect(daysUntilExam(new Date('2026-11-15T00:00:00+09:00'))).toBe(-1);
  });
  it('prioritizes latest wrong, misconception and recent repeated errors', () => {
    expect(reviewPriority(q, [result()], t + 60000)).toBe(12);
    expect(reviewPriority(q, [result(), result({ answeredAt: t + 50000 })], t + 60000)).toBe(15);
    expect(reviewPriority(q, [result({ answeredAt: t - 15 * 86400000 }), result()], t + 60000)).toBe(12);
    expect(reviewPriority(q, [result(), result({ correct: true, confidence: 4, responseTimeMs: 10000, answeredAt: t + 50000 })], t + 60000)).toBe(0);
  });
  it('aggregates attempts, skips, medians, failures and domain groups', () => {
    const d = { ...emptyData(), questions: [q], responses: [result(), result({ id: 'r2', correct: true, selectedAnswer: 0, responseTimeMs: 10000, failureType: null }), result({ id: 'r3', outcome: 'SKIPPED', correct: null, selectedAnswer: null, responseTimeMs: 5000 })] };
    const a = aggregate(d);
    expect(a).toMatchObject({ attempted: 2, total: 3, accuracy: 50, attemptRate: 100 * 2 / 3, skipRate: 100 / 3, medianMs: 25000, easyMisses: 1, misconceptions: 1 });
    expect(groupStats(d, 'domain')[0]).toMatchObject({ label: 'Genetics', attempted: 2 });
    expect(groupStats(d, 'failureType')[0]).toMatchObject({ label: 'K', attempted: 1 });
    expect(aggregate(emptyData()).accuracy).toBe(0);
    expect(timeLeaks(d, 'tags')[0]).toMatchObject({ label: '확률', excessMs: 20000, count: 1 });
    expect(reviewQueue(d, t + 60000)[0].question.id).toBe('q1');
  });
});

describe('trust and session transitions', () => {
  it('can persist generated responses for the maximum permitted question ID length', () => {
    const d = createSession({ ...emptyData(), questions: [{ ...q, id: 'q'.repeat(128) }] }, config, t, '12345678-1234-1234-1234-123456789012');
    expect(validateStudyData(d)).toEqual(d);
  });
  it('excludes drafts unless explicitly included', () => {
    const bank = [q, { ...q, id: 'draft', sourceType: 'DRAFT' as const }];
    expect(eligibleQuestions(bank, 'MIXED', false)).toEqual([q]);
    expect(eligibleQuestions(bank, 'MIXED', true)).toHaveLength(2);
    expect(() => createSession({ ...emptyData(), questions: [bank[1]] }, config, t, 's')).toThrow();
  });
  it('keeps later as the first decision, sums visits and excludes reflection time', () => {
    let d = act(start(), 's1', { type: 'later' }, t + 5000);
    d = act(d, 's1', { type: 'skip' }, t + 8000);
    expect(d.responses[0]).toMatchObject({ firstDecision: 'LATER', revisited: true, responseTimeMs: 5000 });
    d = act(d, 's1', { type: 'submit', answer: 0 }, t + 18000);
    expect(d.responses[0].responseTimeMs).toBe(15000);
    d = act(d, 's1', { type: 'reflect', confidence: 3, failureType: null }, t + 25000);
    d = act(d, 's1', { type: 'next' }, t + 30000);
    expect(d.sessions[0].status).toBe('COMPLETED');
    expect(d.responses[0].responseTimeMs).toBe(15000);
    expect(validateStudyData(d)).toEqual(d);
  });
  it('requires confidence and wrong-answer classification before next', () => {
    let d = act(start(), 's1', { type: 'submit', answer: 1 }, t + 1000);
    expect(() => act(d, 's1', { type: 'next' }, t + 2000)).toThrow();
    d = act(d, 's1', { type: 'reflect', confidence: 4, failureType: null }, t + 2000);
    expect(() => act(d, 's1', { type: 'next' }, t + 3000)).toThrow();
  });
  it('preserves timer through JSON reload and caps an expired question at deadline', () => {
    const d = JSON.parse(JSON.stringify(start()));
    const expired = act(d, 's1', { type: 'expire' }, t + 400000);
    expect(expired.responses[0].responseTimeMs).toBe(300000);
    expect(expired.responses[1]).toMatchObject({ outcome: 'UNREACHED', shownAt: null });
    expect(expired.sessions[0].endedAt).toBe(t + 300000);
    expect(validateStudyData(expired)).toEqual(expired);
  });
  it('rejects invalid choices, repeated submits, repeat deferral, and overlapping sessions', () => {
    expect(() => act(start(), 's1', { type: 'submit', answer: 99 }, t + 1)).toThrow();
    const d = act(start(), 's1', { type: 'submit', answer: 0 }, t + 1);
    expect(() => act(d, 's1', { type: 'submit', answer: 1 }, t + 2)).toThrow();
    expect(() => createSession(start(), config, t, 's2')).toThrow();
    const later = act(act(start(), 's1', { type: 'later' }, t + 1), 's1', { type: 'skip' }, t + 2);
    expect(() => act(later, 's1', { type: 'later' }, t + 3)).toThrow();
  });
});
