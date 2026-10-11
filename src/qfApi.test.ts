import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '../tests/fixtures/qf';
import { normalizeServerURL, listReadySets, downloadReadySet } from './qfApi';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Mac mini READY 전달 경계', () => {
  it('사용자 설정 주소만 사용하며 URL 인증정보와 쿼리를 거절한다', () => {
    expect(normalizeServerURL(' http://127.0.0.1:8765/ ')).toBe('http://127.0.0.1:8765');
    expect(normalizeServerURL('https://mini.example.ts.net/qf/')).toBe('https://mini.example.ts.net/qf');
    for (const url of ['', 'file:///tmp/qf', 'https://name:secret@example.test', 'https://example.test?token=secret', 'https://example.test/#hash']) {
      expect(() => normalizeServerURL(url)).toThrow();
    }
  });
  it('HTTP 오류 코드와 서버 이유를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'SET_NOT_READY', message: '전체 READY 검증 실패' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })));
    await expect(downloadReadySet('http://127.0.0.1:8765', 'run-id')).rejects.toThrow(/409.*SET_NOT_READY.*READY/);
  });
  it('HTML/미지원 목록 응답과 비READY 메타데이터를 거절한다', async () => {
    for (const value of ['<html>wrong server</html>', JSON.stringify({ sets: [] }), JSON.stringify({ api_version: 'qf-ready-api-1.0.0', sets: [{ run_id: 'call-limit', source_status: 'CALL_LIMIT' }] })]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(value)));
      await expect(listReadySets('http://127.0.0.1:8765')).rejects.toThrow();
    }
  });
  it('패키지 전체 검증과 요청 run ID 일치를 강제한다', async () => {
    const p = fixture();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(p)))));
    expect(await downloadReadySet('http://127.0.0.1:8765', p.run_id)).toEqual(p);
    await expect(downloadReadySet('http://127.0.0.1:8765', 'another-run')).rejects.toThrow(/ID/);
    p.questions[0].question.stem = '변조';
    await expect(downloadReadySet('http://127.0.0.1:8765', p.run_id)).rejects.toThrow(/digest/);
  });
  it('네트워크 실패는 CORS/브라우저 권한/서버 점검 안내를 제공한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listReadySets('http://127.0.0.1:8765')).rejects.toThrow(/CORS/);
  });
  it('목록 조회 후 바뀐 패키지와 제한 시간을 넘긴 요청을 거절한다', async () => {
    const pkg = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(pkg))));
    await expect(downloadReadySet('http://127.0.0.1:8765', pkg.run_id, 'f'.repeat(64))).rejects.toThrow(/새로고침/);
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const result = expect(listReadySets('http://127.0.0.1:8765')).rejects.toThrow(/15초/);
    await vi.advanceTimersByTimeAsync(15000);
    await result;
  });
});
