import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixture } from './fixtures/qf';

test('다른 탭에서 종료해도 저장 실패 답안을 복구 파일로 보존한다', async ({ page, context }) => {
  await page.goto('/question-factory');
  await page.getByLabel('QF JSON 파일').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())) });
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await page.getByRole('button', { name: '7번 문항', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('답안 저장됨');
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByLabel('단답형 답안', { exact: true })).toBeVisible();
  // Abort the actual transaction on this tab only, simulating a disk/quota failure.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const request = put.call(this, value, key);
      this.transaction.abort();
      return request;
    };
  });
  await page.getByLabel('단답형 답안', { exact: true }).fill('보존해야 할 미저장 답안');
  await expect(page.getByRole('button', { name: '임시 기록 내보내기', exact: true })).toBeVisible();
  await second.getByRole('button', { name: '세트 제출', exact: true }).click();
  await second.getByRole('button', { name: '세트 제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  // A later failure must not replace an earlier recovery that is still pending.
  await second.goto('/question-factory');
  await second.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await second.getByRole('button', { name: '7번 문항', exact: true }).click();
  await expect(page.getByLabel('단답형 답안', { exact: true })).toBeVisible();
  await page.getByLabel('단답형 답안', { exact: true }).fill('두 번째 미저장 답안');
  await expect(page.getByRole('button', { name: '저장 재시도', exact: true })).toBeVisible();
  await second.getByRole('button', { name: '세트 제출', exact: true }).click();
  await second.getByRole('button', { name: '세트 제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '임시 기록 내보내기', exact: true })).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '임시 기록 내보내기', exact: true }).nth(0).click();
  const file = await download;
  const recovery = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(recovery.qfResponses[6].textAnswer).toBe('보존해야 할 미저장 답안');
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '임시 기록 내보내기', exact: true }).nth(1).click();
  const secondFile = await secondDownload;
  const secondRecovery = JSON.parse(await readFile((await secondFile.path())!, 'utf8'));
  expect(secondRecovery.qfResponses.at(-9).textAnswer).toBe('두 번째 미저장 답안');
  await second.reload();
  await expect(second.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await expect(second.getByTestId('qf-stats')).toContainText('미응답 15');
});
