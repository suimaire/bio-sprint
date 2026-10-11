import { test, expect } from '@playwright/test';
import { fixture } from './fixtures/qf';
import { sha256 } from '../src/qfDigest';
import type { Page } from '@playwright/test';

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const storagePath = '/src/storage.ts';
    const { readRawData } = await import(storagePath);
    return await readRawData() as { revision: number; data: { qfPackages?: unknown[]; questions: unknown[]; sessions: unknown[]; responses: unknown[] } };
  });
}

test('파일 선택 후 창 focus 동기화에도 미리보기와 오류가 유지된다', async ({ page }) => {
  await page.goto('/question-factory');
  await page.getByLabel('QF JSON 파일').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())) });
  await expect(page.locator('.import-preview')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.import-preview')).toBeVisible();
  await page.getByLabel('QF JSON 파일').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('JSON');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('JSON');
  await expect(page.getByText('선택한 파일: invalid.json')).toBeVisible();
});

test('서버 목록 → 미리보기 → IndexedDB 저장 → 중복 방지 → 연결 장애에서도 시작', async ({ page }) => {
  const pkg = fixture(), body = JSON.stringify(pkg);
  const entry = { run_id: pkg.run_id, preset: 'daily15', source_status: 'READY', review_status: 'AI_REVIEWED', schema_version: pkg.schema_version,
    question_count: 15, recommended_time_seconds: 1800, format_counts: pkg.format_counts, created_at: null, updated_at: null,
    generation: { model: null, generation_prompt_version: null }, sha256: sha256(body) };
  let offline = false, downloads = 0;
  await page.route('http://127.0.0.1:8765/api/v1/**', async route => {
    if (offline) return route.abort('connectionrefused');
    const download = route.request().url().endsWith('/download');
    if (download) downloads++;
    await route.fulfill({ contentType: 'application/json', body: download ? body : JSON.stringify({ api_version: 'qf-ready-api-1.0.0', sets: [entry] }) });
  });
  await page.goto('/question-factory');
  await expect(page.getByLabel('Mac mini 서버 주소')).toBeVisible();
  const before = await snapshot(page);
  await page.getByRole('button', { name: '새 세트 불러오기' }).click();
  await expect(page.getByLabel('Mac mini 연결')).toContainText('연결됨');
  await page.getByRole('button', { name: '가져오기 미리보기' }).click();
  await expect(page.locator('.import-preview')).toContainText('15문항');
  expect((await snapshot(page)).data.qfPackages).toBeUndefined();
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await expect(page.getByRole('status')).toContainText('QF 세트 1개');
  const saved = await snapshot(page);
  expect(saved.data.qfPackages).toEqual([pkg]);
  expect(saved.data.questions).toEqual(before.data.questions);
  expect(saved.data.sessions).toEqual(before.data.sessions);
  expect(saved.data.responses).toEqual(before.data.responses);
  await page.getByRole('button', { name: '가져오기 미리보기' }).click();
  await expect(page.locator('.import-preview')).toContainText('QF 세트 0개');
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await expect(page.locator('.import-preview')).toHaveCount(0);
  expect((await snapshot(page)).revision).toBe(saved.revision);
  expect(downloads).toBe(2);
  offline = true;
  await page.reload();
  await page.getByRole('button', { name: '새 세트 불러오기' }).click();
  await expect(page.getByRole('alert')).toContainText('CORS');
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.getByRole('timer')).toContainText('30:');
});

test('실제 로컬 READY 전달은 외부 API가 지정된 경우에만 검사한다', async ({ page }) => {
  test.skip(!process.env.QF_API_URL || !process.env.QF_READY_RUN_ID, '로컬 실제 전달 검사 전용');
  await page.goto('/question-factory');
  await page.getByLabel('Mac mini 서버 주소').fill(process.env.QF_API_URL!);
  await page.getByRole('button', { name: '새 세트 불러오기' }).click();
  const row = page.getByRole('listitem').filter({ hasText: process.env.QF_READY_RUN_ID! });
  await expect(row).toContainText('15문항');
  await row.getByRole('button', { name: '가져오기 미리보기' }).click();
  await expect(page.locator('.import-preview')).toContainText('AI_REVIEWED');
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await expect(page.getByRole('status')).toContainText('QF 세트 1개');
  expect((await snapshot(page)).data.qfPackages?.length).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('.feedback,.explanation,.qf-english')).toHaveCount(0);
});
