import type { FailureType } from './model';

export const QF_FORMATS = ['MCQ', 'COMBINATION', 'SHORT', 'CONSTRUCTED_RESPONSE'] as const;
export type QFFormat = typeof QF_FORMATS[number];
export type SelfGrade = 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'DEFERRED';
export const SELF_GRADES: Record<SelfGrade, string> = { CORRECT: '정답', PARTIAL: '부분 정답', INCORRECT: '오답', DEFERRED: '판단 보류' };
export interface QFQuestion {
  question_id: string; schema_version: 'phase2-2'; status: 'READY';
  stage: number; level: string; format: QFFormat; topic: string; macro_domain: string;
  skill: string; difficulty: string; knowledge_depth: string; reasoning_load: string; language_load: string;
  stem: string; explanation: string; generation_notes: string;
  synthetic_data: boolean; hypothetical_context: boolean;
  evidence_refs: string[]; style_refs: string[]; visual_dependencies: string[];
  validation: { evidence_validated: true; review_digest: string; review_kind: string };
  options?: Record<string, string | string[]>; correct_answer?: string;
  statements?: Record<string, string>; distractor_rationales?: Record<string, string>;
  expected_answer?: string;
  scoring_points?: { point: string; acceptable: string[]; required_concepts: string[]; not_required: string[] }[];
}
export interface QFItem {
  id: string; run_id: string; review_status: 'AI_REVIEWED'; question: QFQuestion;
  provenance: {
    source_file: string; content_digest: string; blueprint: Record<string, unknown>;
    evidence_packet: { schema_version: string; evidence: Record<string, unknown>[]; [key: string]: unknown };
    review: { review: Record<string, unknown>; english: Record<string, unknown> | null; english_qa: Record<string, unknown> | null; [key: string]: unknown };
    blind: Record<string, unknown>; authoring: Record<string, unknown> | null;
  };
}
export interface QFPackage {
  schema_version: 'biosprint-export-1.0.0'; run_id: string; preset: 'daily15' | 'standard50' | 'smoke2';
  source_status: 'READY'; review_status: 'AI_REVIEWED'; recommended_time_seconds: number;
  question_ids: string[]; questions: QFItem[]; format_counts: Record<QFFormat, number>;
  provenance: { manifest: Record<string, unknown>; run_state: Record<string, unknown>; run_provenance: unknown; source_file_sha256: Record<string, string> };
  export_validation: { model_calls: 0; mode: 'DETERMINISTIC_ONLY'; source_revalidated: false };
}
export interface QFSession {
  id: string; runId: string; questionIds: string[]; cursor: number;
  startedAt: number; lastEventAt: number; endedAt: number | null;
  timeLimitSec: 1800; status: 'ACTIVE' | 'COMPLETED'; endReason?: 'SUBMITTED' | 'EXPIRED';
}
export interface QFResponse {
  id: string; sessionId: string; runId: string; questionId: string;
  selectedOption: string | null; textAnswer: string;
  outcome: 'PENDING' | 'ANSWERED' | 'UNANSWERED'; gradingMode: 'AUTO' | 'SELF';
  correct: boolean | null; selfGrade: SelfGrade | null;
  // Optional for backups produced before these reflection controls existed.
  triage?: 'LATER' | 'SKIP' | null;
  rubricChecks?: (boolean | null)[];
  confidence: 1 | 2 | 3 | 4 | 5 | null; failureType: FailureType | null;
  shownAt: number | null; lastShownAt: number | null; answeredAt: number | null;
  firstAnsweredAt: number | null; finalResponseAt: number | null;
  responseTimeMs: number; visitCount: number; revisited: boolean; answerChangeCount: number;
  stage: number; level: string; domain: string; reasoning_load: string; language_load: string;
}
export const isChoice = (q: QFQuestion) => q.format === 'MCQ' || q.format === 'COMBINATION';
export const hasQFAnswer = (r: QFResponse) => r.gradingMode === 'AUTO' ? r.selectedOption !== null : !!r.textAnswer.trim();
