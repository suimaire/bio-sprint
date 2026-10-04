import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const bank = [
  { id: 'smoke-1', mode: 'RECALL', domain: 'Genetics', subdomain: '분리 법칙', difficulty: 1, sourceType: 'REVIEWED', question: 'Aa × Aa에서 aa 자손의 확률은?', choices: ['1/4', '1/2', '3/4', '1'], answer: 0, explanation: '각 부모가 a를 전달할 확률은 1/2이므로 1/4이다.', tags: ['분리 법칙'], targetTimeSec: 10 },
  { id: 'smoke-2', mode: 'DEEP', domain: 'Genetics', subdomain: '독립 법칙', difficulty: 3, sourceType: 'REVIEWED', question: '독립인 두 사건의 동시 발생 확률은?', choices: ['각 확률의 곱', '각 확률의 합'], answer: 0, explanation: '독립 사건의 곱셈 법칙을 적용한다.', tags: ['확률'], targetTimeSec: 60 },
];
async function upload(page: Page, label: string, data: unknown) {
  await page.getByLabel(label, { exact: true }).setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
}
async function importBank(page: Page) {
  await page.goto('/question-bank');
  await upload(page, '문제 JSON 파일', bank);
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await expect(page.getByRole('status')).toContainText('문제 2개');
}
async function begin(page: Page) {
  await page.goto('/training');
  await page.getByLabel('문항 수', { exact: true }).fill('2');
  await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '정답 제출' })).toBeVisible();
}

test('wrong answer → confidence/failure → next → finish → analytics → reload → export/import', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await importBank(page);
  await begin(page);
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await expect(page.getByText('오답입니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '확신도 5', exact: true }).click();
  await page.getByRole('button', { name: 'K 개념/지식 부족', exact: true }).click();
  await page.getByRole('button', { name: '다음 문제', exact: true }).click();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '확신도 3', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '훈련 결과', exact: true })).toBeVisible();
  await expect(page.getByTestId('stat-accuracy')).toContainText('50%');
  await expect(page.getByTestId('stat-easyMisses')).toContainText('1');
  await expect(page.getByTestId('stat-misconceptions')).toContainText('1');
  await page.reload();
  await expect(page.getByTestId('stat-accuracy')).toContainText('50%');
  await page.goto('/');
  await expect(page.getByTestId('history')).toContainText('2문항');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Study Data' }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.sessions).toHaveLength(1);
  expect(exported.responses[0]).toMatchObject({ confidence: 5, failureType: 'K', correct: false });
  // Import IDs are user-supplied text, including URL delimiters and Korean.
  const importedSessionId = '세션#1?복습';
  exported.sessions[0].id = importedSessionId;
  for (const response of exported.responses) response.sessionId = importedSessionId;
  const clean = await browser.newContext();
  const fresh = await clean.newPage();
  await fresh.goto(new URL('/', page.url()).href);
  await upload(fresh, '학습 데이터 JSON 파일', exported);
  await fresh.getByRole('button', { name: '가져오기 적용' }).click();
  await expect(fresh.getByTestId('history')).toContainText('2문항');
  await fresh.reload();
  await expect(fresh.getByTestId('history')).toContainText('2문항');
  await fresh.getByTestId('history').getByRole('link').click();
  await expect(fresh.getByRole('heading', { name: '훈련 결과', exact: true })).toBeVisible();
  await expect(fresh.getByTestId('stat-accuracy')).toContainText('50%');
  await clean.close();
  expect(errors).toEqual([]);
});

test('DRAFT opt-in, triage/revisit, keyboard guards and timer survive reload', async ({ page }) => {
  await page.goto('/training');
  await expect(page.getByLabel('DRAFT 개발용 문제 포함')).not.toBeChecked();
  await expect(page.getByRole('button', { name: '훈련 시작', exact: true })).toBeDisabled();
  await page.getByLabel('DRAFT 개발용 문제 포함').check();
  await page.getByLabel('문항 수', { exact: true }).fill('2');
  await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
  await page.clock.install();
  await page.clock.fastForward(3000);
  await page.keyboard.press('l');
  await expect(page.getByRole('heading', { name: /Michaelis–Menten/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /건너뛰기/ })).toBeEnabled();
  await page.keyboard.press('s');
  await expect(page.getByText('재방문', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /나중에/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByText('재방문', { exact: true })).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '확신도 4', exact: true }).click();
  if (await page.getByText('오답입니다', { exact: true }).isVisible()) await page.getByRole('button', { name: 'C 단순 실수', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByTestId('stat-skipRate')).toContainText('50%');
  await expect(page.getByTestId('response-table')).toContainText('LATER');
});

test('deadline ends unanswered session and preserves a submitted answer for tagging', async ({ page }) => {
  await importBank(page);
  await page.clock.install();
  await page.goto('/training');
  await page.getByLabel('제한 시간 (분)', { exact: true }).fill('1');
  await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('heading', { name: '훈련 결과', exact: true })).toBeVisible();
  await expect(page.getByTestId('stat-attempted')).toContainText('0');
  await begin(page);
  await page.keyboard.press('1'); await page.keyboard.press('Enter');
  await page.clock.fastForward(301000);
  await expect(page.getByText('정답입니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '확신도 4', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByTestId('stat-attempted')).toContainText('1');
});

test('malformed JSON, duplicate IDs and conflicts never replace stored questions', async ({ page }) => {
  await page.goto('/question-bank');
  await upload(page, '문제 JSON 파일', '{broken');
  await expect(page.getByRole('alert')).toContainText('JSON 문법 오류');
  await upload(page, '문제 JSON 파일', [bank[0], bank[0]]);
  await expect(page.getByRole('alert')).toContainText('중복');
  await upload(page, '문제 JSON 파일', [{ ...bank[0], answer: 99 }]);
  await expect(page.getByRole('alert')).toContainText('answer');
  await importBank(page);
  await upload(page, '문제 JSON 파일', [{ ...bank[0], question: 'changed' }]);
  await expect(page.getByRole('alert')).toContainText('충돌');
  await page.getByLabel('문제 검색').fill('Aa × Aa');
  await expect(page.locator('summary').filter({ hasText: bank[0].question })).toBeVisible();
  await page.reload();
  await page.getByLabel('문제 검색').fill('Aa × Aa');
  await expect(page.locator('summary').filter({ hasText: bank[0].question })).toBeVisible();
});

test('IndexedDB rejects stale writes and surfaces corruption without reseeding', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /오늘의 훈련/ })).toBeVisible();
  const message = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    const storage = await import(path);
    const a = await storage.loadData();
    await storage.saveData(a.data, a.revision);
    try { await storage.saveData(a.data, a.revision); return 'unexpected'; } catch (e) { return String(e); }
  });
  expect(message).toContain('다른 탭');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('bio-sprint', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('study', 'readwrite');
      tx.objectStore('study').put({ revision: 999, data: { schemaVersion: 999 } }, 'current');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('schemaVersion');
  await expect(page.getByRole('button', { name: '원본 데이터 내보내기' })).toBeVisible();
});

test('desktop, tablet and phone remain readable without horizontal overflow', async ({ page }) => {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /오늘의 훈련/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${name}-dashboard.png`, fullPage: true });
    await page.goto('/question-bank');
    await expect(page.getByRole('heading', { name: '문제 은행', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('known long-wrong case drives diagnostics, TIME LEAK and the review queue', async ({ page }) => {
  await importBank(page);
  await page.clock.install();
  await begin(page);
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${name}-training.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.fastForward(25000);
  await page.reload();
  await page.keyboard.press('2'); await page.keyboard.press('Enter');
  await page.keyboard.press('5');
  await expect(page.getByRole('button', { name: '확신도 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'K 개념/지식 부족', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: bank[1].question, exact: true })).toBeVisible();
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: '훈련 결과', exact: true })).toBeVisible();
  await expect(page.locator('.diagnostic-strip')).toContainText('장시간 오답 1');
  await expect(page.locator('.diagnostic-strip')).toContainText('시간 투자 주의 1');
  await expect(page.locator('.rank-list')).toContainText('분리 법칙');
  await page.screenshot({ path: 'test-results/desktop-results.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/phone-results.png', fullPage: true });
  await page.goto('/review');
  await expect(page.locator('.review-list')).toContainText('우선도 12');
});

for (const [name, width, height, touch] of [
  ['desktop', 1440, 1000, false],
  ['ipad-landscape', 1180, 820, true],
  ['ipad-portrait', 820, 1180, true],
] as const) {
  test.describe(`Training feedback on ${name}`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch });
    test('keeps one reachable next action before explanation without auto-advancing', async ({ page }) => {
      await importBank(page);
      await page.clock.install();
      await begin(page);
      await page.clock.fastForward(4000);
      await page.keyboard.press('1');
      await page.keyboard.press('Enter');
      const next = page.getByRole('button', { name: '다음 문제', exact: true });
      await expect(next).toBeDisabled();
      const confidence = page.getByRole('button', { name: '확신도 4', exact: true });
      if (touch) await confidence.tap(); else await confidence.click();
      await expect(confidence).toHaveAttribute('aria-pressed', 'true');
      await expect(next).toBeEnabled();
      await expect(page.getByRole('heading', { name: bank[0].question, exact: true })).toBeVisible();
      await expect(next).toHaveCount(1);
      await page.screenshot({ path: `test-results/${name}-training-feedback.png`, fullPage: true });
      const panel = (await page.locator('.reflection').boundingBox())!;
      const action = (await next.boundingBox())!;
      const choices = (await page.locator('.confidence-row').boundingBox())!;
      const explanation = (await page.locator('.explanation').boundingBox())!;
      expect(action.y).toBeGreaterThanOrEqual(choices.y + choices.height);
      expect(action.y + action.height).toBeLessThanOrEqual(panel.y + panel.height);
      expect(action.y + action.height).toBeLessThanOrEqual(explanation.y);
      expect(action.height).toBeGreaterThanOrEqual(48);
      if (touch) {
        expect(action.width).toBeGreaterThanOrEqual(panel.width - 46);
        await expect(next).toBeInViewport({ ratio: 1 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.explanation')).toContainText(bank[0].explanation);
      await page.clock.fastForward(30000);
      if (touch) await next.tap(); else await page.keyboard.press('Space');
      await expect(page.getByRole('heading', { name: bank[1].question, exact: true })).toBeVisible();
      await page.keyboard.press('2');
      await page.keyboard.press('Enter');
      const finish = page.getByRole('button', { name: '결과 보기', exact: true });
      await expect(finish).toBeVisible();
      await expect(page.getByRole('button', { name: '확신도 3', exact: true })).toBeEnabled();
      await page.keyboard.press('3');
      await expect(page.getByRole('button', { name: '확신도 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(finish).toBeDisabled();
      await page.keyboard.press('Space');
      await expect(page.getByText('오답입니다', { exact: true })).toBeVisible();
      await page.keyboard.press('k');
      await expect(finish).toBeEnabled();
      await expect(page.locator('.reflection').getByRole('button', { name: '결과 보기', exact: true })).toHaveCount(1);
      if (touch) await finish.tap(); else await page.keyboard.press('Space');
      await expect(page.getByRole('heading', { name: '훈련 결과', exact: true })).toBeVisible();
      await page.goto('/');
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export Study Data' }).click();
      const exported = JSON.parse(await readFile((await (await downloadEvent).path())!, 'utf8'));
      expect(exported.sessions[0].status).toBe('COMPLETED');
      expect(exported.responses[0]).toMatchObject({ correct: true, confidence: 4, failureType: null });
      expect(exported.responses[0].responseTimeMs).toBeGreaterThanOrEqual(4000);
      expect(exported.responses[0].responseTimeMs).toBeLessThan(15000);
      expect(exported.responses[1]).toMatchObject({ correct: false, confidence: 3, failureType: 'K' });
    });
  });
}
