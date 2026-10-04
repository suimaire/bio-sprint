import { EXAM_DATE, type Question, type Response, type StudyData } from './model';

export const THRESHOLDS = { fast: 0.75, slow: 1.5, badInvestment: 2, repeatDays: 14 } as const;
export type DiagnosticFlag = 'EASY_MISS' | 'SLOW_CORRECT' | 'LONG_WRONG' | 'MISCONCEPTION_CANDIDATE' | 'BAD_INVESTMENT';
export const FLAG_LABELS: Record<DiagnosticFlag, string> = { EASY_MISS: '쉬운 문제 오답', SLOW_CORRECT: '느린 정답', LONG_WRONG: '장시간 오답', MISCONCEPTION_CANDIDATE: '오개념 후보', BAD_INVESTMENT: '시간 투자 주의' };

export function classifyTime(ms: number, target: number) {
  const ratio = ms / (target * 1000);
  return ratio < THRESHOLDS.fast ? 'FAST' : ratio > THRESHOLDS.slow ? 'SLOW' : 'NORMAL';
}
export function diagnosticFlags(q: Question, r: Response): DiagnosticFlag[] {
  const flags: DiagnosticFlag[] = [];
  const wrong = r.outcome === 'ANSWERED' && r.correct === false;
  const ratio = r.responseTimeMs / (q.targetTimeSec * 1000);
  if (wrong && q.difficulty <= 2) flags.push('EASY_MISS');
  if (r.correct === true && ratio > THRESHOLDS.slow) flags.push('SLOW_CORRECT');
  if (wrong && ratio > THRESHOLDS.slow) flags.push('LONG_WRONG');
  if (wrong && (r.confidence ?? 0) >= 4) flags.push('MISCONCEPTION_CANDIDATE');
  if (ratio > THRESHOLDS.badInvestment && (r.correct !== true || q.difficulty >= 4)) flags.push('BAD_INVESTMENT');
  return flags;
}
export function seoulDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function daysUntilExam(date = new Date()) {
  return Math.round((Date.parse(EXAM_DATE) - Date.parse(seoulDate(date))) / 86400000);
}
export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2 : 0;
}
export function aggregate(data: StudyData, responses = data.responses) {
  const rows = responses.filter(r => r.outcome !== 'PENDING');
  const attempted = rows.filter(r => r.outcome === 'ANSWERED');
  const correct = attempted.filter(r => r.correct).length;
  const bank = new Map(data.questions.map(q => [q.id, q]));
  const flags = rows.flatMap(r => bank.has(r.questionId) ? diagnosticFlags(bank.get(r.questionId)!, r) : []);
  const count = (flag: DiagnosticFlag) => flags.filter(f => f === flag).length;
  return { total: rows.length, attempted: attempted.length, correct, skipped: rows.length - attempted.length,
    accuracy: attempted.length ? correct * 100 / attempted.length : 0,
    attemptRate: rows.length ? attempted.length * 100 / rows.length : 0,
    skipRate: rows.length ? (rows.length - attempted.length) * 100 / rows.length : 0,
    medianMs: median(attempted.map(r => r.responseTimeMs)),
    easyMisses: count('EASY_MISS'), slowCorrect: count('SLOW_CORRECT'), misconceptions: count('MISCONCEPTION_CANDIDATE'),
    longWrong: count('LONG_WRONG'), badInvestments: count('BAD_INVESTMENT'),
  };
}
export function groupStats(data: StudyData, by: 'domain' | 'subdomain' | 'mode' | 'failureType', responses = data.responses) {
  const groups = new Map<string, Response[]>();
  for (const r of responses.filter(r => r.outcome !== 'PENDING')) {
    const q = data.questions.find(q => q.id === r.questionId);
    const label = by === 'failureType' ? (r.outcome === 'ANSWERED' && !r.correct ? r.failureType : null) : q?.[by];
    if (label) groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups].map(([label, rows]) => ({ label, ...aggregate(data, rows) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted || a.label.localeCompare(b.label));
}
export function timeLeaks(data: StudyData, by: 'domain' | 'subdomain' | 'tags', responses = data.responses) {
  const groups = new Map<string, { label: string; excessMs: number; count: number }>();
  for (const r of responses.filter(r => r.outcome !== 'PENDING')) {
    const q = data.questions.find(q => q.id === r.questionId);
    if (!q || r.responseTimeMs <= q.targetTimeSec * 1000 * THRESHOLDS.slow) continue;
    for (const label of new Set(by === 'tags' ? q.tags : [q[by]])) {
      const g = groups.get(label) ?? { label, excessMs: 0, count: 0 };
      g.excessMs += r.responseTimeMs - q.targetTimeSec * 1000;
      g.count++;
      groups.set(label, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.excessMs - a.excessMs || b.count - a.count || a.label.localeCompare(b.label));
}
export function reviewPriority(q: Question, responses: Response[], now: number) {
  const attempts = responses.filter(r => r.questionId === q.id && r.outcome === 'ANSWERED')
    .sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));
  const last = attempts[0];
  if (!last) return 0;
  if (last.correct) return classifyTime(last.responseTimeMs, q.targetTimeSec) === 'SLOW' ? 2 : 0;
  const repeat = attempts.filter(r => !r.correct && (r.answeredAt ?? 0) >= now - THRESHOLDS.repeatDays * 86400000 && (r.answeredAt ?? 0) <= now).length;
  return 5 + ((last.confidence ?? 0) >= 4 ? 7 : 0) + Math.max(0, repeat - 1) * 3;
}
export function reviewQueue(data: StudyData, now = Date.now()) {
  return data.questions.map(question => ({ question, priority: reviewPriority(question, data.responses, now) }))
    .filter(row => row.priority > 0).sort((a, b) => b.priority - a.priority || a.question.id.localeCompare(b.question.id));
}
