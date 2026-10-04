import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function start(page: Page) {
  await page.goto('/training');
  await page.getByRole('radio', { name: /REAL EXAM — 90 MIN/ }).check();
  await expect(page.getByLabel('제한 시간 (분)', { exact: true })).toHaveValue('90');
  await expect(page.getByRole('button', { name: 'REAL EXAM 시작' })).toBeDisabled();
  await page.getByLabel('DRAFT 개발용 문제 포함').check();
  await expect(page.getByLabel('문항 수', { exact: true })).toHaveValue('27');
  await page.getByRole('button', { name: 'REAL EXAM 시작' }).click();
  await expect(page.getByRole('timer')).toContainText('90:00');
}
async function noFeedback(page: Page) {
  await expect(page.locator('.choice.correct,.choice.wrong,.feedback,.explanation')).toHaveCount(0);
  await expect(page.getByText(/정답입니다|오답입니다|정답과 해설|SCORE LEAK|MISCONCEPTION|우선순위 복습|확신도/)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
}
async function persisted(page: Page) {
  await expect(page.getByRole('button', { name: '시험 제출', exact: true })).toBeEnabled();
}

test('REAL EXAM answer / Later / Skip / direct navigation / no feedback / submit / reload / review and export', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await start(page);
  await page.clock.fastForward(31000);
  await page.keyboard.press('2');
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: '2번 미응답, 현재', exact: true })).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: '2번 Later', exact: true })).toBeVisible();
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: '3번 Skip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1번 답변함', exact: true }).click();
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await noFeedback(page);
  await page.keyboard.press('Enter');
  await noFeedback(page);
  await page.reload();
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '2번 Later', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '3번 Skip', exact: true })).toBeVisible();
  await noFeedback(page);
  await page.getByRole('button', { name: '시험 제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await expect(page.getByTestId('exam-stat-total')).toContainText('27');
  await expect(page.getByTestId('exam-stat-attempted')).toContainText('1');
  await expect(page.getByTestId('exam-stat-incorrect')).toContainText('1');
  await expect(page.getByTestId('leak-KNOWN_BUT_LOST')).toHaveText('0');
  await expect(page.getByTestId('leak-BAD_INVESTMENT')).toHaveText('1');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await page.locator('.investment-link').first().click();
  await expect(page.locator('.exam-review-detail')).toContainText('정답:');
  await page.getByLabel('시험 후 실패 유형').selectOption('T');
  await page.getByLabel('시험 후 확신도').selectOption('3');
  await expect(page.getByLabel('시험 후 확신도')).toBeEnabled();
  await page.getByRole('button', { name: '2번 · 미응답', exact: true }).click();
  await page.getByLabel('시험 후 실패 유형').selectOption('S');
  await expect(page.getByLabel('시험 후 실패 유형')).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: '2번 · 미응답', exact: true }).click();
  await expect(page.getByLabel('시험 후 실패 유형')).toHaveValue('S');
  await page.goto('/');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Study Data' }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.responses[0]).toMatchObject({ correct: false, confidence: 3, failureType: 'T', visitCount: 2 });
  // Import order is not a semantic question order.
  exported.responses.reverse();
  const clean = await browser.newContext(); const fresh = await clean.newPage();
  await fresh.goto(new URL('/', page.url()).href);
  await fresh.getByLabel('학습 데이터 JSON 파일', { exact: true }).setInputFiles({ name: 'exam.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await fresh.getByRole('button', { name: '가져오기 적용' }).click();
  await fresh.getByTestId('history').getByRole('link').click();
  await expect(fresh.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await fresh.getByRole('button', { name: '1번 · 오답', exact: true }).click();
  await expect(fresh.locator('.exam-review-detail h3')).toHaveText(exported.questions.find((q: { id: string }) => q.id === exported.sessions[0].questionIds[0]).question);
  await clean.close(); expect(errors).toEqual([]);
});

test('a previously open learning tab locks when another tab starts an exam', async ({ page, context }) => {
  await page.goto('/question-bank');
  await page.locator('.question-list summary').first().click();
  await expect(page.locator('.question-list details[open]')).toContainText('정답');
  const exam = await context.newPage();
  await start(exam);
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('.question-list')).toHaveCount(0);
  await noFeedback(page);
  await exam.getByRole('button', { name: '시험 제출', exact: true }).click();
  await exam.getByRole('button', { name: '제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
});

test('all routes hide learning feedback during an exam, and clearing/answer changes survive reload', async ({ page }) => {
  await page.clock.install(); await start(page);
  await page.keyboard.press('1'); await persisted(page);
  await page.keyboard.press('2'); await persisted(page);
  await page.getByRole('button', { name: '답안 지우기' }).click(); await persisted(page);
  await page.reload();
  await expect(page.locator('[data-choice][aria-pressed=true]')).toHaveCount(0);
  for (const route of ['/', '/analytics', '/review', '/question-bank', '/session/missing']) {
    await page.goto(route); await expect(page.getByRole('timer')).toBeVisible(); await noFeedback(page);
  }
  await page.keyboard.press('1'); await persisted(page);
  await page.clock.fastForward(5400001);
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await expect(page.getByTestId('exam-stat-attempted')).toContainText('1');
  await expect(page.getByText('시간 만료 · 자동 제출', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '1번 · 정답', exact: true }).click();
  await expect(page.locator('.exam-review-detail')).toContainText('답안 변경 3회');
  await page.reload(); await expect(page.getByTestId('exam-stat-correct')).toContainText('1');
});

test('time away and expiration on reload preserve a saved answer and cap time at 90 minutes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') }); await start(page);
  await page.keyboard.press('1'); await persisted(page);
  await page.clock.setSystemTime(new Date('2026-10-04T13:31:00Z'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await expect(page.getByTestId('exam-stat-correct')).toContainText('1');
  await expect(page.getByText('시간 만료 · 자동 제출 · 90분 0초 / 90분', { exact: true })).toBeVisible();
  await expect(page.getByTestId('leak-KNOWN_BUT_LOST')).not.toHaveText('0');
});

test('failed answer save is recoverable, including expiration before retry', async ({ page }) => {
  await page.clock.install(); await start(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args);
      if (this.name === 'study') { IDBObjectStore.prototype.put = put; this.transaction.abort(); }
      return request;
    };
  });
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  await expect(page.getByRole('button', { name: '임시 기록 내보내기' })).toBeVisible();
  await page.clock.fastForward(5400001);
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await expect(page.getByTestId('exam-stat-correct')).toContainText('1');
  await page.reload(); await expect(page.getByTestId('exam-stat-correct')).toContainText('1');
});

test('retrying a failed answer never overwrites newer answers from another tab', async ({ page, context }) => {
  await start(page);
  const second = await context.newPage(); await second.goto('/training');
  await expect(second.getByRole('timer')).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args);
      if (this.name === 'study') { IDBObjectStore.prototype.put = put; this.transaction.abort(); }
      return request;
    };
  });
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  await second.getByRole('button', { name: '2번 미방문', exact: true }).click();
  await second.locator('[data-choice]').nth(1).click();
  await expect(page.getByRole('button', { name: '2번 답변함, 현재', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '다른 탭' })).toBeVisible();
  await second.reload();
  await expect(second.getByRole('button', { name: '2번 답변함, 현재', exact: true })).toBeVisible();
  await expect(second.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '임시 기록 내보내기' })).toBeVisible();
});

test('desktop and tablet exam content, navigator, countdown and report remain usable', async ({ page }) => {
  await page.clock.install(); await start(page);
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('timer')).toBeInViewport();
    const question = await page.locator('.exam-question').boundingBox();
    const navigator = await page.getByRole('navigation', { name: '시험 문항 탐색' }).boundingBox();
    expect(question!.width).toBeGreaterThan(navigator!.width * 2);
    const target = page.getByRole('button', { name: '27번 미방문', exact: true });
    await expect(target).toBeInViewport({ ratio: 1 });
    const box = await target.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/${name}-real-exam.png`, fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByRole('timer')).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.clock.fastForward(31000);
  await page.keyboard.press('2'); await persisted(page);
  await page.getByRole('button', { name: '27번 미방문', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음 →', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '시험 제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'REAL EXAM 결과', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1번 · 오답', exact: true }).click();
  await expect(page.locator('.exam-review-detail')).toContainText('정답:');
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `test-results/${name}-real-exam-report.png`, fullPage: true });
  }
});
