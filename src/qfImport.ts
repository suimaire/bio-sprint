import { QF_FORMATS, type QFPackage } from './qfModel';
import { canonicalQF, qfDigest } from './qfDigest';
export { qfDigest } from './qfDigest';

export const objectQF = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const strings = (v: unknown, nonempty = true): v is string[] => Array.isArray(v) && (!nonempty || v.length > 0) && v.every(text) && new Set(v).size === v.length;
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function requireQF(ok: unknown, message: string): asserts ok { if (!ok) throw new Error('QF 가져오기 거절: ' + message); }
const same = (a: unknown, b: unknown) => canonicalQF(a) === canonicalQF(b);
const exact = (v: Record<string, unknown>, keys: string[]) => same(Object.keys(v).sort(), [...keys].sort());
const qaChecks = ['grounding', 'sufficiency', 'unique_answer', 'distractors', 'level', 'difficulty', 'unsupported_claims', 'reasoning_adequacy', 'distractor_discrimination'];
const englishChecks = ['ap_college_style', 'conditions_clear', 'grammar', 'no_language_ambiguity', 'no_rare_vocabulary_bottleneck', 'not_translationese'];
function checks(v: unknown, keys: string[]) {
  return objectQF(v) && exact(v, keys) && Object.values(v).every(c => objectQF(c) && exact(c, ['passed', 'note']) && c.passed === true && text(c.note));
}
function validateReview(q: Record<string, unknown>, review: Record<string, unknown>) {
  requireQF(exact(review, ['question_id','content_digest','reviewer','claims','qa','option_checks','statement_checks','uncertainties','decision','revision_count','reasoning_steps','distractor_discrimination']) && text(review.reviewer) && Number.isInteger(review.revision_count) && (review.revision_count as number) >= 0 && (review.revision_count as number) <= 2, 'AI 검토 구조 오류');
  requireQF(strings(review.reasoning_steps) && review.reasoning_steps.length >= ({ LOW: 1, MEDIUM: 2, HIGH: 3 }[q.reasoning_load as string] ?? 1), 'AI 추론 기록 누락');
  const rationales = (q.distractor_rationales ?? {}) as Record<string, unknown>;
  requireQF(objectQF(review.distractor_discrimination) && exact(review.distractor_discrimination, Object.keys(rationales)) && Object.values(review.distractor_discrimination).every(c => objectQF(c) && exact(c, ['temptation','elimination','requires_interpretation']) && text(c.temptation) && text(c.elimination) && typeof c.requires_interpretation === 'boolean' && (q.reasoning_load === 'LOW' || c.requires_interpretation)), '오답 판별 검토 누락');
  requireQF(Array.isArray(review.claims) && review.claims.length > 0 && review.claims.some(c => objectQF(c) && c.basis === 'source'), '근거 주장 검토 누락');
  for (const c of review.claims) requireQF(objectQF(c) && exact(c, ['claim','basis','evidence_refs','reason']) && text(c.claim) && text(c.reason) && ['source','provided','derived'].includes(c.basis as string) && strings(c.evidence_refs, c.basis !== 'provided') && c.evidence_refs.every(ref => (q.evidence_refs as string[]).includes(ref)), 'AI 검토 근거 참조 불일치');
  const options = (q.options ?? {}) as Record<string, unknown>, statements = (q.statements ?? {}) as Record<string, unknown>;
  for (const [check, keys] of [[review.option_checks, Object.keys(options)], [review.statement_checks, Object.keys(statements)]] as const) {
    requireQF(objectQF(check) && exact(check, keys) && Object.values(check).every(c => objectQF(c) && exact(c, ['correct','reason']) && typeof c.correct === 'boolean' && text(c.reason)), '선택지/진술 검토 누락');
  }
  const accepted = (checks: unknown) => Object.entries(checks as Record<string, { correct: boolean }>).filter(([, c]) => c.correct).map(([k]) => k);
  if (q.options) requireQF(same(accepted(review.option_checks), [q.correct_answer]), '검토된 선택지 정답 불일치');
  if (q.format === 'COMBINATION') requireQF(same(Object.entries(options).filter(([, v]) => same([...(v as string[])].sort(), accepted(review.statement_checks).sort())).map(([k]) => k), [q.correct_answer]), '검토된 진술 정답 불일치');
}
function validateEnglish(english: Record<string, unknown>) {
  requireQF(exact(english, ['question_id','content_digest','language_features','english_review']), '영어 검토 구조 오류');
  const features = english.language_features, layer = english.english_review;
  requireQF(objectQF(features) && exact(features, ['key_command_verb','essential_condition_phrases','comparison_phrases','potentially_blocking_vocabulary']) && text(features.key_command_verb) && ['essential_condition_phrases','comparison_phrases','potentially_blocking_vocabulary'].every(k => strings(features[k], false)), '영어 언어 특징 누락');
  requireQF(objectQF(layer) && exact(layer, ['what_the_question_asks','essential_vocabulary','korean_paraphrase','english_reading_tip','biology_vs_language']) && ['what_the_question_asks','korean_paraphrase','english_reading_tip'].every(k => text(layer[k])), '영어 읽기 도움 누락');
  requireQF(Array.isArray(layer.essential_vocabulary) && layer.essential_vocabulary.length >= 3 && layer.essential_vocabulary.length <= 8 && layer.essential_vocabulary.every(v => objectQF(v) && exact(v, ['expression','korean']) && text(v.expression) && text(v.korean)), '영어 어휘 검토 누락');
  requireQF(objectQF(layer.biology_vs_language) && exact(layer.biology_vs_language, ['biology','language']) && Object.values(layer.biology_vs_language).every(text), '개념/독해 구분 누락');
}
const blueprintFields = ['question_id', 'stage', 'level', 'format', 'topic', 'macro_domain', 'skill', 'difficulty', 'knowledge_depth', 'reasoning_load', 'language_load'];
export function validateQFPackage(input: unknown): QFPackage {
  requireQF(objectQF(input), '패키지 객체가 필요합니다.');
  requireQF(exact(input, ['schema_version','run_id','preset','source_status','review_status','recommended_time_seconds','question_ids','questions','format_counts','provenance','export_validation']), '패키지 필드 누락 또는 미지원 구조');
  requireQF(input.schema_version === 'biosprint-export-1.0.0', 'biosprint-export-1.0.0만 지원합니다.');
  requireQF(input.source_status === 'READY' && input.review_status === 'AI_REVIEWED', '완성된 READY / AI_REVIEWED 패키지가 필요합니다.');
  requireQF(typeof input.run_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input.run_id), 'run_id 오류');
  const profiles: Record<string, number[]> = { daily15: [6, 6, 3], standard50: [20, 20, 10], smoke2: [1, 0, 1] };
  requireQF(typeof input.preset === 'string' && Object.hasOwn(profiles, input.preset), '미지원 preset');
  const stages = profiles[input.preset], n = stages.reduce((a, b) => a + b, 0);
  requireQF(input.recommended_time_seconds === 1800, 'v1 권장 시간 불일치');
  const ev = input.export_validation;
  requireQF(objectQF(ev) && exact(ev, ['model_calls','mode','source_revalidated']) && ev.model_calls === 0 && ev.mode === 'DETERMINISTIC_ONLY' && ev.source_revalidated === false, 'export 검증 기록 누락');
  requireQF(Array.isArray(input.questions) && input.questions.length === n && strings(input.question_ids) && input.question_ids.length === n, '전체 문항 수/목록 불일치');
  const expectedIds = Array.from({ length: n }, (_, i) => 'q' + String(i + 1).padStart(2, '0'));
  requireQF(same(input.question_ids, expectedIds.map(id => 'qf:' + input.run_id + ':' + id)), 'question_ids 순서 또는 run_id 불일치');
  const provenance = input.provenance;
  requireQF(objectQF(provenance) && objectQF(provenance.manifest) && objectQF(provenance.run_state), '원본 provenance 누락');
  requireQF(exact(provenance, ['manifest','run_state','run_provenance','source_file_sha256']) && (provenance.run_provenance === null || objectQF(provenance.run_provenance)), '원본 provenance 구조 오류');
  const manifest = provenance.manifest, run = provenance.run_state;
  for (const original of [manifest, run]) requireQF(original.run_id === input.run_id && original.preset === input.preset && original.status === 'READY', '원본 run_id/preset/READY 불일치');
  requireQF(manifest.schema_version === 'phase2-2' && Array.isArray(manifest.questions) && manifest.questions.length === n, 'manifest schema/목록 불일치');
  requireQF(objectQF(run.slots) && same(Object.keys(run.slots).sort(), expectedIds) && Object.values(run.slots).every(s => objectQF(s) && s.status === 'READY'), 'READY slot 누락 또는 불일치');
  requireQF(objectQF(provenance.source_file_sha256) && Object.keys(provenance.source_file_sha256).length > 0 && Object.values(provenance.source_file_sha256).every(hash) && Object.hasOwn(provenance, 'run_provenance'), '원본 파일 해시/provenance 누락');
  const entries = new Map<string, Record<string, unknown>>();
  for (const e of manifest.questions) { requireQF(objectQF(e) && text(e.question_id) && !entries.has(e.question_id), 'manifest 문항 ID 중복/누락'); entries.set(e.question_id, e); }
  const counts: Record<string, number> = Object.fromEntries(QF_FORMATS.map(f => [f, 0]));
  const actualStages = [0, 0, 0];
  const sourceFiles = ['manifest.json', 'run.json', 'blueprint.json'];
  if (provenance.run_provenance !== null) sourceFiles.push('provenance.json');
  input.questions.forEach((w, i) => {
    const label = expectedIds[i];
    requireQF(objectQF(w) && w.id === (input.question_ids as string[])[i] && w.run_id === input.run_id && w.review_status === 'AI_REVIEWED', label + ': wrapper ID/run/검토 불일치');
    requireQF(exact(w, ['id','run_id','review_status','question','provenance']), label + ': 미지원 wrapper 구조');
    const q = w.question, p = w.provenance;
    requireQF(objectQF(q) && objectQF(p), label + ': 문항/provenance 누락');
    requireQF(exact(p, ['source_file','content_digest','blueprint','evidence_packet','review','blind','authoring']), label + ': 미지원 provenance 구조');
    sourceFiles.push('questions/' + label + '.json', 'reviews/' + label + '.json', 'reviews/' + label + '-blind.json', 'packets/' + label + '.json');
    if (p.authoring !== null) sourceFiles.push('authoring/' + label + '.json');
    requireQF(q.question_id === label && q.status === 'READY' && q.schema_version === 'phase2-2', label + ': 원본 ID/READY/schema 오류');
    requireQF(typeof q.format === 'string' && QF_FORMATS.includes(q.format as typeof QF_FORMATS[number]), label + ': 미지원 형식');
    requireQF(Number.isInteger(q.stage) && [1, 2, 3].includes(q.stage as number), label + ': stage 오류');
    const stage = q.stage as number;
    requireQF((stage === 1 ? ['BIO_I', 'BIO_II'] : stage === 2 ? ['COLLEGE'] : ['AP']).includes(q.level as string), label + ': level 오류');
    requireQF((stage === 1 ? ['MCQ', 'COMBINATION'] : stage === 2 ? ['MCQ', 'SHORT'] : ['MCQ', 'CONSTRUCTED_RESPONSE']).includes(q.format), label + ': stage/형식 불일치');
    requireQF(q.difficulty === 'NORMAL' && ['BASIC', 'STANDARD'].includes(q.knowledge_depth as string) && ['LOW', 'MEDIUM', 'HIGH'].includes(q.reasoning_load as string) && q.language_load === (stage === 3 ? 'MEDIUM' : 'LOW'), label + ': 난도/load 오류');
    requireQF(stage === 1 || q.knowledge_depth === 'STANDARD', label + ': Stage 2/3 지식 깊이 오류');
    for (const k of ['topic', 'macro_domain', 'skill', 'stem', 'explanation', 'generation_notes']) requireQF(text(q[k]), label + ': ' + k + ' 누락');
    requireQF(typeof q.synthetic_data === 'boolean' && typeof q.hypothetical_context === 'boolean' && (!q.synthetic_data || q.hypothetical_context), label + ': 가상/합성 표시 오류');
    requireQF(strings(q.evidence_refs) && same(q.style_refs, []) && same(q.visual_dependencies, []), label + ': 근거 누락 또는 v1 미지원 시각/style 자료');
    const choice = q.format === 'MCQ' || q.format === 'COMBINATION';
    const common = ['question_id','schema_version','status','stage','level','format','topic','macro_domain','skill','difficulty','knowledge_depth','reasoning_load','language_load','stem','explanation','generation_notes','synthetic_data','hypothetical_context','evidence_refs','style_refs','visual_dependencies','validation'];
    requireQF(exact(q, [...common, ...(choice ? ['options','correct_answer','distractor_rationales'] : ['expected_answer','scoring_points']), ...(q.format === 'COMBINATION' ? ['statements'] : [])]), label + ': 문항 필드 누락 또는 미지원 필드');
    if (choice) {
      requireQF(objectQF(q.options), label + ': 선택지 누락');
      const keys = Object.keys(q.options);
      requireQF(keys.length >= 2 && keys.length <= 5 && same(keys, 'ABCDE'.slice(0, keys.length).split('')) && typeof q.correct_answer === 'string' && keys.includes(q.correct_answer), label + ': 선택지 순서/정답 오류');
      if (q.format === 'MCQ') {
        requireQF(Object.values(q.options).every(text), label + ': 선택지는 문자열이어야 합니다.');
        const normalized = Object.values(q.options).map(v => (v as string).normalize('NFKC').toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ').replace(/\s/gu, ''));
        requireQF(new Set(normalized).size === normalized.length, label + ': 중복 선택지');
      }
      else {
        requireQF(objectQF(q.statements) && exact(q.statements, ['ㄱ','ㄴ','ㄷ']) && Object.values(q.statements).every(text), label + ': 진술 누락');
        requireQF(Object.values(q.options).every(v => strings(v) && v.every(k => ['ㄱ','ㄴ','ㄷ'].includes(k))), label + ': 조합은 원본 진술 ID 배열이어야 합니다.');
        const combinations = Object.values(q.options).map(v => [...(v as string[])].sort().join(','));
        requireQF(new Set(combinations).size === combinations.length, label + ': 중복 진술 조합');
      }
      requireQF(objectQF(q.distractor_rationales) && exact(q.distractor_rationales, keys.filter(k => k !== q.correct_answer)) && Object.values(q.distractor_rationales).every(text), label + ': 오답 해설 누락');
    } else {
      requireQF(text(q.expected_answer) && Array.isArray(q.scoring_points) && q.scoring_points.length > 0, label + ': 예시 정답/rubric 누락');
      for (const point of q.scoring_points) requireQF(objectQF(point) && exact(point, ['point','acceptable','required_concepts','not_required']) && text(point.point) && strings(point.acceptable) && strings(point.required_concepts) && strings(point.not_required, false), label + ': rubric 필드 오류');
    }
    const digest = qfDigest(q), entry = entries.get(label);
    requireQF(p.content_digest === digest && entry?.content_digest === digest && entry?.file === 'questions/' + label + '.json' && p.source_file === entry.file, label + ': 본문 digest 또는 출처 binding 불일치');
    requireQF(objectQF(q.validation) && exact(q.validation, ['evidence_validated','review_digest','review_kind']) && q.validation.evidence_validated === true && q.validation.review_digest === digest && q.validation.review_kind === 'AI semantic review; not expert verification', label + ': 검토 binding 불일치');
    requireQF(objectQF(p.blueprint) && blueprintFields.every(k => same((p.blueprint as Record<string, unknown>)[k], q[k])), label + ': blueprint 불일치');
    const rv = p.review, blind = p.blind;
    requireQF(objectQF(rv) && objectQF(rv.review) && rv.blind_matches_intended === true && rv.substantial_duplicate === false, label + ': AI 검토 누락/미통과');
    requireQF(rv.review.question_id === label && rv.review.content_digest === digest && rv.review.decision === 'READY' && checks(rv.review.qa, qaChecks) && same(rv.review.uncertainties, []), label + ': AI 검토 digest/READY/QA 불일치');
    validateReview(q, rv.review);
    requireQF(objectQF(blind) && blind.question_id === label && blind.content_digest === digest && same(blind.ambiguity, []) && text(blind.answer) && (!choice || blind.answer.trim() === q.correct_answer), label + ': 독립 풀이 불일치');
    requireQF(p.authoring === null || (objectQF(p.authoring) && p.authoring.question_id === label && p.authoring.content_digest === digest), label + ': 저작 기록 불일치');
    if (stage === 3) {
      requireQF(objectQF(rv.english) && rv.english.question_id === label && rv.english.content_digest === digest && objectQF(rv.english.english_review) && checks(rv.english_qa, englishChecks), label + ': 영어 검토 누락/미통과');
      validateEnglish(rv.english);
    } else requireQF(rv.english === null, label + ': Stage 1/2 영어 검토 불일치');
    const packet = p.evidence_packet;
    requireQF(objectQF(packet) && packet.schema_version === 'phase1-1' && Array.isArray(packet.evidence), label + ': 근거 packet 누락');
    const refs: string[] = [];
    for (const e of packet.evidence) {
      requireQF(objectQF(e) && ['evidence_id','source_id','source_file','source_path','source_version','extraction_version','pdf_page_index','pdf_page_number','fact_status','chunks'].every(k => Object.hasOwn(e, k)) && text(e.evidence_id) && Array.isArray(e.chunks), label + ': 근거 출처 필드 누락');
      refs.push(e.evidence_id);
      for (const c of e.chunks) { requireQF(objectQF(c) && text(c.chunk_id), label + ': chunk ID 누락'); refs.push(c.chunk_id); }
    }
    requireQF(q.evidence_refs.every(ref => refs.filter(r => r === ref).length === 1), label + ': evidence refs 누락/중복');
    counts[q.format]++; actualStages[stage - 1]++;
  });
  requireQF(same(input.format_counts, counts) && same(stages, actualStages), 'format_counts/stage 개수 불일치');
  requireQF(input.preset !== 'daily15' || same(counts, { MCQ: 9, COMBINATION: 3, SHORT: 2, CONSTRUCTED_RESPONSE: 1 }), 'DAILY-15 형식은 MCQ 9 / COMBINATION 3 / SHORT 2 / CONSTRUCTED_RESPONSE 1이어야 합니다.');
  // File bytes are not carried separately by v1: preserve their hashes and
  // verify the inventory, never pretend reserialized JSON proves byte hashes.
  requireQF(exact(provenance.source_file_sha256 as Record<string, unknown>, sourceFiles), '원본 파일 해시 목록 누락 또는 불일치');
  const stats = manifest.batch_qa;
  requireQF(objectQF(stats) && stats.count === n && same(stats.stages, Object.fromEntries(stages.flatMap((count, i) => count ? [[String(i + 1), count]] : []))), 'manifest 개수/stage 통계 불일치');
  return input as unknown as QFPackage;
}
export function isQFPackage(value: unknown): boolean { return objectQF(value) && Object.hasOwn(value, 'schema_version'); }
export function mergeQFPackages(current: QFPackage[] = [], incoming: QFPackage[] = []): QFPackage[] {
  const map = new Map(current.map(p => [p.run_id, p]));
  const items = new Map(current.flatMap(p => p.questions.map(w => [w.id, w] as const)));
  for (const p of incoming) {
    for (const w of p.questions) {
      const old = items.get(w.id);
      if (old && (old.provenance.content_digest !== w.provenance.content_digest || !same(old, w))) throw new Error('QF ID 충돌: ' + w.id + ' — 기존 문항과 기록을 보존했습니다.');
    }
    const old = map.get(p.run_id);
    if (old && !same(old, p)) throw new Error('QF run_id 충돌: ' + p.run_id + ' — 기존 패키지를 보존했습니다.');
    if (!old) { map.set(p.run_id, p); for (const w of p.questions) items.set(w.id, w); }
  }
  return [...map.values()];
}
