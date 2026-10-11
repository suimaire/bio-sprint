import { test, expect, type Page } from '@playwright/test';
import { type Snapshot } from '../src/storage';
import { fixture } from './fixtures/qf';

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, trace: 'off', screenshot: 'off', video: 'off' });

type KeyInput = Pick<KeyboardEventInit, 'key' | 'code' | 'location' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'keyCode' | 'repeat'>;

async function keys(page: Page, events: KeyInput[]) {
  // One browser task deliberately leaves no React render/save gap between keys.
  return page.evaluate(events => events.map(init => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event.defaultPrevented;
  }), events);
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => new Promise<Snapshot>((resolve, reject) => {
    const request = indexedDB.open('bio-sprint', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('study', 'readonly').objectStore('study').get('current');
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/question-factory');
  await page.getByLabel('QF JSON 파일').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())) });
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 1');
  await expect(page.locator('#qf-question-heading')).toBeFocused();
});

test('단축키 선택·왕복·빠른 연속 입력을 문항별로 저장하고 복구한다', async ({ page }) => {
  await page.keyboard.press('B');
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('4');
  await expect(page.getByRole('button', { name: '확신도 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await keys(page, [{ key: 'E' }, { key: 'ArrowLeft' }])).toEqual([false, false]);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 2');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '확신도 4', exact: true })).toHaveAttribute('aria-pressed', 'true');

  expect(await keys(page, [
    { key: 'a' }, { key: '2' }, { key: 'ArrowRight' },
    { key: 'b' }, { key: '5', code: 'Numpad5', location: 3 }, { key: 'ArrowRight' },
    { key: 'a' }, { key: '3' }, { key: 'ArrowLeft' },
  ])).toEqual(Array(9).fill(true));
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 2');
  await expect(page.locator('[data-choice]').nth(1)).toHaveClass(/selected/);
  await expect(page.getByRole('button', { name: '확신도 5', exact: true })).toHaveClass(/selected/);
  await expect(page.getByRole('status')).toContainText('답안 저장됨');
  const saved = await snapshot(page);
  expect(saved.data.qfResponses!.slice(0, 3).map(r => [r.selectedOption, r.confidence])).toEqual([['A', 2], ['B', 5], ['A', 3]]);
  expect(saved.data.qfResponses![0]).toMatchObject({ visitCount: 2, revisited: true, answerChangeCount: 1 });
  expect(saved.data.qfResponses![0].responseTimeMs).toBeGreaterThan(0);
  expect(saved.data.qfResponses![0].firstAnsweredAt).not.toBeNull();
  await page.reload();
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 2');
  await expect(page.locator('#qf-question-heading')).toBeFocused();
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '확신도 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-choice]').nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '확신도 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('입력 필드·IME·수정키·길게 누르기는 단축키와 충돌하지 않는다', async ({ page }) => {
  expect(await keys(page, [
    { key: 'b', ctrlKey: true }, { key: 'b', metaKey: true }, { key: 'b', altKey: true },
    { key: 'b', isComposing: true }, { key: 'b', keyCode: 229 },
    { key: 'ArrowRight', repeat: true }, { key: '4', repeat: true }, { key: 'Tab' },
  ])).toEqual(Array(8).fill(false));
  await page.locator('#qf-question-heading').dispatchEvent('compositionstart');
  expect(await keys(page, [{ key: 'b' }, { key: '4' }, { key: 'ArrowRight' }])).toEqual([false, false, false]);
  await page.locator('#qf-question-heading').dispatchEvent('compositionend');
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 1');
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);

  // Check other editable targets without introducing production-only test UI.
  for (const tag of ['input', 'select', 'div']) {
    await page.evaluate(tag => {
      const field = document.createElement(tag);
      field.id = 'keyboard-test-field';
      if (tag === 'div') field.contentEditable = 'true';
      document.querySelector('.qf-player')!.append(field);
      field.focus();
    }, tag);
    expect(await keys(page, [{ key: 'b' }, { key: '4' }, { key: 'ArrowRight' }])).toEqual([false, false, false]);
    await page.locator('#keyboard-test-field').evaluate(node => node.remove());
  }
  await page.getByRole('button', { name: '7번 문항', exact: true }).click();
  expect(await keys(page, [{ key: 'A' }])).toEqual([false]);
  const answer = page.getByLabel('단답형 답안', { exact: true });
  await answer.focus();
  await page.keyboard.type('A4');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('B');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('5');
  await expect(answer).toHaveValue('AB45');
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 7');
  await expect(page.locator('.confidence[aria-pressed="true"]')).toHaveCount(0);
});

test('확신도 옆 다음 버튼·좁은 화면·제출 확인·마지막 문항 경계를 지킨다', async ({ page }) => {
  const next = page.getByRole('button', { name: '다음 문항 →', exact: true });
  await expect(next).toBeVisible();
  const confidence = await page.getByRole('button', { name: '확신도 5', exact: true }).boundingBox();
  const wide = await next.boundingBox();
  expect(wide!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(wide!.y - confidence!.y)).toBeLessThan(2);
  expect(wide!.x).toBeGreaterThan(confidence!.x + confidence!.width);
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await next.boundingBox();
  const row = await page.locator('.qf-confidence .confidence-row').boundingBox();
  expect(narrow!.y).toBeGreaterThanOrEqual(row!.y + row!.height);
  expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(390);
  await next.click();
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 2');
  await expect(page.locator('.confidence[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '세트 제출', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '세트 제출', exact: true }).click();
  expect(await keys(page, [{ key: 'B' }, { key: '4' }, { key: 'ArrowRight' }])).toEqual([false, false, false]);
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 2');
  await page.getByRole('button', { name: '계속 풀기', exact: true }).click();
  await page.getByRole('button', { name: '15번 문항', exact: true }).click();
  await expect(next).toBeDisabled();
  expect(await keys(page, [{ key: 'A' }, { key: 'ArrowRight' }])).toEqual([false, false]);
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('답안 저장됨');
  const saved = await snapshot(page);
  expect(saved.data.qfSessions![0]).toMatchObject({ status: 'ACTIVE', cursor: 14, endedAt: null });
  await page.getByRole('button', { name: '세트 제출', exact: true }).click();
  await page.getByRole('button', { name: '세트 제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  expect(await keys(page, [{ key: 'B' }, { key: '4' }, { key: 'ArrowRight' }])).toEqual([false, false, false]);
});
