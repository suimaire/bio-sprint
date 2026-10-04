import { aggregate, diagnosticFlags, THRESHOLDS } from './metrics';
import { type Response, type Session, type StudyData } from './model';

export type ExamFlag = 'EASY_MISS' | 'LONG_WRONG' | 'BAD_INVESTMENT' | 'KNOWN_BUT_LOST';
export const EXAM_FLAG_LABELS: Record<ExamFlag, string> = { EASY_MISS: 'Easy miss', LONG_WRONG: 'Long wrong', BAD_INVESTMENT: 'Bad investment', KNOWN_BUT_LOST: 'Known-but-lost' };

export function examFlags(data: StudyData, session: Session, r: Response): ExamFlag[] {
  if (session.mode !== 'REAL_EXAM' || session.status !== 'COMPLETED') return [];
  const q = data.questions.find(q => q.id === r.questionId)!;
  const flags: ExamFlag[] = diagnosticFlags(q, r).filter((f): f is 'EASY_MISS' | 'LONG_WRONG' => f === 'EASY_MISS' || f === 'LONG_WRONG');
  if (r.correct !== true && r.responseTimeMs > q.targetTimeSec * 1000 * THRESHOLDS.badInvestment) flags.push('BAD_INVESTMENT');
  if (session.endReason === 'EXPIRED' && r.selectedAnswer === null) {
    const priorTraining = data.responses.filter(prior => prior.questionId === q.id && prior.outcome === 'ANSWERED' && data.sessions.some(s => s.id === prior.sessionId && s.mode !== 'REAL_EXAM' && s.status === 'COMPLETED' && s.endedAt! <= session.startedAt))
      .sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))[0];
    // ponytail: same-question evidence only; topic inference needs validated bank/history first.
    if (q.difficulty <= 2 || priorTraining?.correct === true) flags.push('KNOWN_BUT_LOST');
  }
  return flags;
}

export function examReport(data: StudyData, session: Session) {
  if (session.mode !== 'REAL_EXAM' || session.status !== 'COMPLETED') return null;
  const rows = data.responses.filter(r => r.sessionId === session.id);
  const summary = aggregate(data, rows);
  const sum = (test: (r: Response) => boolean) => rows.filter(test).reduce((total, r) => total + r.responseTimeMs, 0);
  const flags = rows.flatMap(r => examFlags(data, session, r));
  return { ...summary, incorrect: summary.attempted - summary.correct, unanswered: summary.total - summary.attempted,
    badInvestments: flags.filter(f => f === 'BAD_INVESTMENT').length,
    correctTimeMs: sum(r => r.correct === true), incorrectTimeMs: sum(r => r.correct === false), unansweredTimeMs: sum(r => r.selectedAnswer === null),
    laterTimeMs: sum(r => r.decisions.some(d => d.decision === 'LATER')), skippedTimeMs: sum(r => r.decisions.some(d => d.decision === 'SKIP')), revisitedTimeMs: sum(r => r.revisited),
    flags: Object.fromEntries(Object.keys(EXAM_FLAG_LABELS).map(f => [f, flags.filter(flag => flag === f).length])) as Record<ExamFlag, number>,
    worst: rows.filter(r => r.correct !== true && r.responseTimeMs > 0).sort((a, b) => b.responseTimeMs - a.responseTimeMs || a.questionId.localeCompare(b.questionId)),
  };
}

export function examMetadataStats(data: StudyData, session: Session, by: 'language' | 'stimulusType' | 'contextNovelty') {
  if (session.mode !== 'REAL_EXAM' || session.status !== 'COMPLETED') return [];
  const groups = new Map<string, Response[]>();
  for (const r of data.responses.filter(r => r.sessionId === session.id)) {
    const label = data.questions.find(q => q.id === r.questionId)?.[by] ?? '미지정';
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups].map(([label, rows]) => ({ label, ...aggregate(data, rows) }));
}
