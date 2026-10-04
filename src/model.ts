export const TAXONOMY = {
  Biochemistry: '생화학', 'Cell Biology': '세포생물학', 'Molecular Biology': '분자생물학',
  Genetics: '유전학', Physiology: '생리학', Immunology: '면역학', Evolution: '진화',
  Ecology: '생태학', 'Plant Biology': '식물생물학', 'Developmental Biology': '발생학',
  'Experimental Biology': '실험생물학',
} as const;
export type BiologyDomain = keyof typeof TAXONOMY;
export const MODES = ['RECALL', 'INTERPRET', 'DEEP'] as const;
export type QuestionMode = typeof MODES[number];
export type SessionMode = QuestionMode | 'MIXED' | 'REAL_EXAM';
export const LANGUAGES = ['KO', 'EN'] as const;
export const STIMULUS_TYPES = ['DIRECT', 'PASSAGE', 'GRAPH', 'TABLE', 'EXPERIMENT', 'PEDIGREE', 'CALCULATION'] as const;
export const CONTEXT_NOVELTIES = ['STANDARD', 'TRANSFER'] as const;
export const SOURCES = ['VERIFIED', 'REVIEWED', 'DRAFT'] as const;
export const FAILURES = { K: '개념/지식 부족', R: '추론/자료해석', T: '시간 부족', C: '단순 실수', S: '문제 선택 실패' } as const;
export type FailureType = keyof typeof FAILURES;
export type TriageDecision = 'SOLVE' | 'LATER' | 'SKIP';
export interface Question {
  id: string; mode: QuestionMode; domain: BiologyDomain; subdomain: string;
  difficulty: 1 | 2 | 3 | 4 | 5; sourceType: typeof SOURCES[number];
  question: string; choices: string[]; answer: number; explanation: string;
  tags: string[]; targetTimeSec: number; fixture?: boolean;
  language?: typeof LANGUAGES[number];
  stimulusType?: typeof STIMULUS_TYPES[number];
  contextNovelty?: typeof CONTEXT_NOVELTIES[number];
}
export interface Session {
  id: string; mode: SessionMode; questionIds: string[]; queue: string[]; cursor: number;
  startedAt: number; endedAt: number | null; timeLimitSec: number;
  status: 'ACTIVE' | 'COMPLETED'; includeDrafts: boolean;
  endReason?: 'SUBMITTED' | 'EXPIRED';
}
export interface Response {
  id: string; sessionId: string; questionId: string;
  outcome: 'PENDING' | 'ANSWERED' | 'SKIPPED' | 'UNREACHED';
  selectedAnswer: number | null; correct: boolean | null;
  confidence: 1 | 2 | 3 | 4 | 5 | null; failureType: FailureType | null;
  shownAt: number | null; answeredAt: number | null; lastShownAt: number | null;
  responseTimeMs: number; firstDecision: TriageDecision | null;
  decisions: { decision: TriageDecision; at: number }[];
  visitCount: number; revisited: boolean;
  firstAnsweredAt?: number | null; finalResponseAt?: number | null; answerChangeCount?: number;
}
export interface StudyData { schemaVersion: 1; questions: Question[]; sessions: Session[]; responses: Response[] }
export const EXAM_DATE = '2026-11-14';
export const emptyData = (): StudyData => ({ schemaVersion: 1, questions: [], sessions: [], responses: [] });
