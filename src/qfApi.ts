import { objectQF, validateQFPackage } from './qfImport';
import { QF_FORMATS, type QFFormat } from './qfModel';
import { parseJSON } from './validation';
import { sha256 } from './qfDigest';

export const DEFAULT_QF_SERVER = 'http://127.0.0.1:8765';
export const QF_SERVER_KEY = 'bio-sprint-qf-server';
export interface ReadySet {
  run_id: string; preset: 'daily15'; source_status: 'READY'; review_status: 'AI_REVIEWED';
  schema_version: 'biosprint-export-1.0.0'; question_count: 15; recommended_time_seconds: 1800;
  format_counts: Record<QFFormat, number>; created_at: string | null; updated_at: string | null;
  generation: { model: string | null; generation_prompt_version: string | null }; sha256: string;
}
export function normalizeServerURL(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('서버 주소를 http:// 또는 https://부터 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('서버 주소에는 HTTP(S) 주소만 입력하세요. 인증정보·쿼리·#은 넣지 마세요.');
  }
  return url.href.replace(/\/+$/, '');
}
const nullableText = (value: unknown) => value === null || typeof value === 'string';
function validSet(value: unknown): value is ReadySet {
  if (!objectQF(value) || typeof value.run_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.run_id)) return false;
  return value.preset === 'daily15' && value.source_status === 'READY' && value.review_status === 'AI_REVIEWED' &&
    value.schema_version === 'biosprint-export-1.0.0' && value.question_count === 15 && value.recommended_time_seconds === 1800 &&
    typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) &&
    nullableText(value.created_at) && nullableText(value.updated_at) && objectQF(value.generation) &&
    nullableText(value.generation.model) && nullableText(value.generation.generation_prompt_version) &&
    objectQF(value.format_counts) && QF_FORMATS.every((format, i) => (value.format_counts as Record<string, unknown>)[format] === [9, 3, 2, 1][i]);
}
async function request(server: string, path: string): Promise<{ value: unknown; text: string }> {
  const base = normalizeServerURL(server);
  const url = new URL(base);
  if (typeof location !== 'undefined' && location.protocol === 'https:' && url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('HTTPS 화면에서 HTTP 서버 연결은 브라우저가 차단합니다. Tailscale Serve의 HTTPS 주소를 설정해 주세요.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let response: Response;
    try {
      response = await fetch(base + path, { signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    } catch {
      if (controller.signal.aborted) throw new Error('Mac mini 응답 시간이 초과되었습니다(15초). 서버 실행 상태와 주소를 확인하고 다시 시도하세요.');
      throw new Error('Mac mini에 연결할 수 없습니다. 두 기기의 Tailscale 연결과 같은 tailnet 사용 여부, 서버 실행·HTTPS 주소·인증서·DNS·접근 정책, API의 허용 origin(CORS), 브라우저의 로컬 네트워크 권한을 확인하세요. 브라우저는 이 원인들을 구분해 알려주지 않습니다. iPad에서는 Mac mini의 Tailscale Serve HTTPS 주소를 사용하세요. 127.0.0.1은 iPad 자신입니다.');
    }
    let raw: string;
    try {
      if (Number(response.headers.get('Content-Length')) > 50 * 1024 * 1024) throw new Error('SIZE');
      raw = await response.text();
    } catch {
      throw new Error(controller.signal.aborted ? 'Mac mini 응답 시간이 초과되었습니다(15초).' : '서버 응답을 읽지 못했습니다. 연결과 응답 크기(최대 50 MB)를 확인하세요.');
    }
    if (new TextEncoder().encode(raw).length > 50 * 1024 * 1024) throw new Error('서버 응답은 50 MB 이내여야 합니다.');
    let value: unknown;
    try { value = parseJSON(raw); } catch { throw new Error(`서버가 올바른 JSON을 반환하지 않았습니다(HTTP ${response.status}). READY API 주소인지 확인하세요.`); }
    if (!response.ok) {
      const error = objectQF(value) && objectQF(value.error) ? value.error : {};
      throw new Error(`HTTP ${response.status} · ${typeof error.code === 'string' ? error.code : 'SERVER_ERROR'}: ${typeof error.message === 'string' ? error.message : '서버 요청 실패'}`);
    }
    return { value, text: raw };
  } finally { clearTimeout(timeout); }
}
export async function listReadySets(server: string): Promise<ReadySet[]> {
  const { value } = await request(server, '/api/v1/sets');
  if (!objectQF(value) || value.api_version !== 'qf-ready-api-1.0.0' || !Array.isArray(value.sets) ||
      !value.sets.every(validSet) || new Set(value.sets.map(s => s.run_id)).size !== value.sets.length) {
    throw new Error('지원하지 않거나 검증되지 않은 READY 목록입니다. Mac mini API 버전과 세트 상태를 확인하세요.');
  }
  return value.sets;
}
export async function downloadReadySet(server: string, runId: string, expectedHash?: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new Error('올바르지 않은 세트 ID입니다.');
  const { value, text } = await request(server, '/api/v1/sets/' + encodeURIComponent(runId) + '/download');
  const pkg = validateQFPackage(value);
  if (pkg.run_id !== runId || pkg.preset !== 'daily15') throw new Error('요청한 DAILY-15 세트 ID와 응답이 다릅니다.');
  if (expectedHash && sha256(text) !== expectedHash) throw new Error('목록 조회 후 세트 내용이 달라졌습니다. 목록을 새로고침한 뒤 다시 가져오세요.');
  return pkg;
}
