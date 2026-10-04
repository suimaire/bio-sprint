import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { emptyData, type Question } from './model';
import { act, createSession, examNavigatorState, reflectExam } from './sessionEngine';
import { examFlags, examReport, examMetadataStats } from './examMetrics';
import { validateQuestionBank, validateStudyData } from './validation';
import { ExamPlayer } from './Exam';

const t = 1000000;
const q: Question = { id: 'q1', mode: 'RECALL', domain: 'Genetics', subdomain: '유전 확률', difficulty: 2, sourceType: 'REVIEWED', question: 'QUESTION_ONLY', choices: ['A', 'B'], answer: 0, explanation: 'SECRET_EXPLANATION', tags: [], targetTimeSec: 20 };
const start = (limit = 5400) => createSession({ ...emptyData(), questions: [q, { ...q, id: 'q2', mode: 'DEEP', difficulty: 4 }, { ...q, id: 'q3' }] }, { mode: 'REAL_EXAM', count: 100, timeLimitSec: limit, includeDrafts: false }, t, 'exam');
const step = (d: ReturnType<typeof start>, action: Parameters<typeof act>[2], ms: number) => {
  const next = act(d, 'exam', action, t + ms);
  expect(validateStudyData(JSON.parse(JSON.stringify(next)))).toEqual(next);
  return next;
};

describe('REAL EXAM engine and compatibility', () => {
  it('uses all eligible modes without duplication and keeps answer keys hidden until completion', () => {
    let d = start();
    expect(d.sessions[0].questionIds).toEqual(['q1', 'q2', 'q3']);
    expect(d.sessions[0].timeLimitSec).toBe(5400);
    d = step(d, { type: 'submit', answer: 1 }, 1000);
    expect(d.responses[0]).toMatchObject({ outcome: 'PENDING', correct: null, selectedAnswer: 1, confidence: null, answeredAt: t + 1000 });
    expect(() => act(d, 'exam', { type: 'reflect', confidence: 5, failureType: 'K' }, t + 2000)).toThrow();
    const html = renderToStaticMarkup(createElement(ExamPlayer, { data: d, session: d.sessions[0], busy: false, onSave: async () => true }));
    expect(html).toContain('QUESTION_ONLY');
    for (const leak of ['SECRET_EXPLANATION', '정답입니다', '오답입니다', '정답과 해설', '확신도', 'EASY_MISS', 'SCORE LEAK', 'class="choice correct']) expect(html).not.toContain(leak);
    expect(examReport(d, d.sessions[0])).toBeNull();
  });
  it('tracks first/final answers, triage, clearing, repeat visits and cumulative question time', () => {
    let d = step(start(), { type: 'submit', answer: 0 }, 1000);
    d = step(d, { type: 'submit', answer: 0 }, 2000);
    d = step(d, { type: 'submit', answer: 1 }, 3000);
    d = step(d, { type: 'later' }, 4000);
    expect(examNavigatorState(d.responses[0])).toEqual(['답변함', 'Later']);
    expect(examNavigatorState(d.responses[2])).toEqual(['미방문']);
    d = step(d, { type: 'skip' }, 5000);
    expect(examNavigatorState(d.responses[1])).toEqual(['Skip']);
    d = step(d, { type: 'navigate', index: 0 }, 6000);
    d = step(d, { type: 'clear' }, 7000);
    d = step(d, { type: 'next' }, 8000);
    d = step(d, { type: 'previous' }, 9000);
    d = step(d, { type: 'submit', answer: 0 }, 10000);
    d = step(d, { type: 'finish' }, 11000);
    expect(d.responses[0]).toMatchObject({ correct: true, firstAnsweredAt: t + 1000, answeredAt: t + 10000, finalResponseAt: t + 10000, answerChangeCount: 3, visitCount: 3, responseTimeMs: 8000, firstDecision: 'SOLVE' });
    expect(d.sessions[0]).toMatchObject({ status: 'COMPLETED', endReason: 'SUBMITTED' });
  });
  it('does not finish on the last question, and rejects out-of-range navigation', () => {
    let d = step(start(), { type: 'navigate', index: 2 }, 1000);
    d = step(d, { type: 'next' }, 2000);
    d = step(d, { type: 'later' }, 3000);
    expect(d.sessions[0].status).toBe('ACTIVE');
    expect(d.sessions[0].cursor).toBe(2);
    expect(() => act(d, 'exam', { type: 'navigate', index: 3 }, t + 4000)).toThrow();
  });
  it.each(['expire', 'submit', 'finish'] as const)('finalizes exactly at the deadline on %s without overwriting a saved answer', type => {
    let d = step(start(10), { type: 'submit', answer: 0 }, 9999);
    d = step(JSON.parse(JSON.stringify(d)), type === 'submit' ? { type, answer: 1 } : { type }, 10000);
    expect(d.sessions[0]).toMatchObject({ endedAt: t + 10000, endReason: 'EXPIRED', status: 'COMPLETED' });
    expect(d.responses[0]).toMatchObject({ selectedAnswer: 0, correct: true, responseTimeMs: 10000 });
    expect(d.responses[1].outcome).toBe('UNREACHED');
    expect(act(d, 'exam', { type: 'expire' }, t + 20000)).toEqual(d);
  });
  it('does not expire early and closes a resumed visit at the original deadline', () => {
    const d = start(10);
    expect(act(d, 'exam', { type: 'expire' }, t + 9999)).toBe(d);
    expect(step(d, { type: 'expire' }, 999999).responses[0].responseTimeMs).toBe(10000);
  });
  it('allows optional post-exam reflection on unanswered questions, but no grading edits', () => {
    const d = step(start(), { type: 'finish' }, 1000);
    const reflected = reflectExam(d, 'exam', 'q2', 3, 'T');
    expect(validateStudyData(reflected).responses[1]).toMatchObject({ confidence: 3, failureType: 'T', selectedAnswer: null });
    expect(() => reflectExam(start(), 'exam', 'q1', 3, 'T')).toThrow();
  });
  it('keeps old banks loadable, validates optional metadata and rejects malformed exam records', () => {
    expect(validateQuestionBank([q])).toEqual([q]);
    expect(validateQuestionBank([{ ...q, language: 'EN', stimulusType: 'CALCULATION', contextNovelty: 'TRANSFER' }])).toHaveLength(1);
    for (const bad of [{ language: 'FR' }, { stimulusType: 'VIDEO' }, { contextNovelty: 'NOVEL' }]) expect(() => validateQuestionBank([{ ...q, ...bad }])).toThrow();
    for (const bad of [{ correct: true }, { selectedAnswer: 99 }, { answerChangeCount: -1 }, { firstAnsweredAt: t - 1 }, { finalResponseAt: t - 1 }]) {
      const d = start(); Object.assign(d.responses[0], bad); expect(() => validateStudyData(d)).toThrow();
    }
  });
});

describe('exam execution heuristics', () => {
  it('counts exact outcomes and unsuccessful investment with strict thresholds', () => {
    let d = step(start(), { type: 'submit', answer: 1 }, 40000);
    d = step(d, { type: 'next' }, 40001);
    d = step(d, { type: 'submit', answer: 0 }, 50000);
    d = step(d, { type: 'finish' }, 90002);
    const report = examReport(d, d.sessions[0])!;
    expect(report).toMatchObject({ total: 3, attempted: 2, correct: 1, incorrect: 1, unanswered: 1, accuracy: 50, medianMs: 45001, correctTimeMs: 50001, incorrectTimeMs: 40001, badInvestments: 1 });
    expect(report.worst.map(r => r.questionId)).toEqual(['q1']);
    expect(examFlags(d, d.sessions[0], d.responses[0])).toEqual(['EASY_MISS', 'LONG_WRONG', 'BAD_INVESTMENT']);
    expect(examFlags(d, d.sessions[0], d.responses[1])).not.toContain('BAD_INVESTMENT');
    expect(examFlags(d, d.sessions[0], { ...d.responses[0], responseTimeMs: 40000 })).not.toContain('BAD_INVESTMENT');
  });
  it('marks only unanswered easy items on expiry without claiming knowledge on manual submission', () => {
    const expired = step(start(10), { type: 'expire' }, 10000);
    expect(expired.responses.map(r => examFlags(expired, expired.sessions[0], r).includes('KNOWN_BUT_LOST'))).toEqual([true, false, true]);
    const submitted = step(start(), { type: 'finish' }, 1000);
    expect(submitted.responses.flatMap(r => examFlags(submitted, submitted.sessions[0], r))).not.toContain('KNOWN_BUT_LOST');
  });
  it('uses only the last completed Training attempt before exam start as knowledge evidence', () => {
    let training = createSession({ ...emptyData(), questions: [q, { ...q, id: 'q2', difficulty: 4 }] }, { mode: 'MIXED', count: 2, timeLimitSec: 100, includeDrafts: false }, t - 100000, 'train');
    training = act(training, 'train', { type: 'skip' }, t - 99000);
    training = act(training, 'train', { type: 'submit', answer: 0 }, t - 98000);
    training = act(training, 'train', { type: 'finish' }, t - 97000);
    let d = createSession(training, { mode: 'REAL_EXAM', count: 2, timeLimitSec: 10, includeDrafts: false }, t, 'exam');
    d = step(d, { type: 'expire' }, 10000);
    const s = d.sessions[1], r = d.responses[3];
    expect(examFlags(d, s, r)).toContain('KNOWN_BUT_LOST');
    for (const mode of ['REAL_EXAM'] as const) {
      const changed = structuredClone(d); changed.sessions[0].mode = mode;
      expect(examFlags(changed, s, r)).not.toContain('KNOWN_BUT_LOST');
    }
    const wrong = structuredClone(d); wrong.responses[1].correct = false;
    expect(examFlags(wrong, s, r)).not.toContain('KNOWN_BUT_LOST');
    const future = structuredClone(d); future.sessions[0].endedAt = t + 1;
    expect(examFlags(future, s, r)).not.toContain('KNOWN_BUT_LOST');
  });
  it('groups metadata with explicit unknowns and does not fabricate legacy labels', () => {
    let d = start();
    Object.assign(d.questions[0], { language: 'KO', stimulusType: 'DIRECT', contextNovelty: 'STANDARD' });
    Object.assign(d.questions[1], { language: 'EN', stimulusType: 'CALCULATION', contextNovelty: 'TRANSFER' });
    d = step(d, { type: 'submit', answer: 0 }, 1000);
    d = step(d, { type: 'finish' }, 2000);
    for (const [key, labels] of [['language', ['KO', 'EN', '미지정']], ['stimulusType', ['DIRECT', 'CALCULATION', '미지정']], ['contextNovelty', ['STANDARD', 'TRANSFER', '미지정']]] as const) {
      const groups = examMetadataStats(d, d.sessions[0], key);
      expect(groups.map(g => g.label)).toEqual(labels);
      expect(groups.map(g => g.attempted)).toEqual([1, 0, 0]);
    }
  });
});
