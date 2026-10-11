import { test, expect, type Page, type Locator } from '@playwright/test';
import { fixture } from './fixtures/qf';
import type { Snapshot } from '../src/storage';

test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });

async function study(page: Page): Promise<Snapshot> {
  return page.evaluate(() => new Promise<Snapshot>((resolve, reject) => {
    const r = indexedDB.open('bio-sprint', 1);
    r.onsuccess = () => { const db = r.result, q = db.transaction('study').objectStore('study').get('current'); q.onsuccess = () => { resolve(q.result); db.close(); }; q.onerror = () => reject(q.error); };
  }));
}
async function stroke(canvas: Locator, type = 'pen', end = 'pointerup') {
  await canvas.evaluate((el, { type, end }) => {
    const svg = el as SVGSVGElement, m = svg.getScreenCTM()!;
    const event = (name: string, x: number, y: number) => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, pointerId: 41, pointerType: type, clientX: p.x, clientY: p.y, pressure: .6, button: 0, buttons: name === 'pointerup' ? 0 : 1 }));
    };
    event('pointerdown', 40, 30); event('pointermove', 90, 40); event('pointermove', 160, 35); event(end, 180, 35);
  }, { type, end });
}
const note = (page: Page) => page.locator('svg[data-ink-surface="scratchpad"]');
const stem = (page: Page) => page.locator('svg[data-ink-surface="stem"]');
async function openNote(page: Page) {
  await page.getByRole('button', { name: '풀이 노트', exact: true }).click();
  await expect(note(page)).toHaveAttribute('data-ready', 'true');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/question-factory');
  await page.getByLabel('QF JSON 파일').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture('daily15', '\n' + '온도와 농도를 일정하게 유지한 합성 실험이다. '.repeat(8)))) });
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 1');
});

test('노트 필기는 답안 데이터를 바꾸지 않고 문항 이동·새로고침 뒤 복원된다', async ({ page }) => {
  await page.keyboard.press('B'); await page.keyboard.press('4');
  await expect(page.getByRole('status').first()).toContainText('답안 저장됨');
  const before = await study(page);
  await openNote(page); await stroke(note(page));
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  expect(await study(page)).toEqual(before);
  await page.keyboard.press('ArrowRight');
  await openNote(page); await expect(note(page).locator('[data-stroke]')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft'); await openNote(page);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await page.reload(); await openNote(page);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '확신도 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('지문/진술 도구 이력과 고정 텍스트 정렬, 손가락·마우스 제외', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  await stroke(stem(page), 'touch'); await stroke(stem(page), 'mouse');
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(0);
  await stroke(stem(page));
  const tools = page.getByRole('group', { name: '지문 필기 도구', exact: true });
  await tools.getByRole('button', { name: '형광펜', exact: true }).click(); await stroke(stem(page));
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(2);
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(2);
  const statement = page.locator('svg[data-ink-surface="statement"]');
  await stroke(statement);
  await expect(statement.locator('[data-stroke]')).toHaveCount(1);
  const box = await page.locator('#qf-question-heading').boundingBox();
  expect(box!.height).toBeGreaterThan(100);
  const paths = await stem(page).locator('[data-stroke]').evaluateAll(nodes => nodes.map(n => n.outerHTML));
  await page.setViewportSize({ width: 768, height: 1024 });
  const resized = await page.locator('#qf-question-heading').boundingBox();
  expect(resized!.width).toBe(box!.width); expect(resized!.height).toBe(box!.height);
  expect(await stem(page).locator('[data-stroke]').evaluateAll(nodes => nodes.map(n => n.outerHTML))).toEqual(paths);
  await page.keyboard.press('B'); await page.keyboard.press('5');
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-choice]').nth(0).tap();
  await expect(page.locator('[data-choice]').nth(0)).toHaveAttribute('aria-pressed', 'true');
});

test('취소된 stroke도 보존하고 노트 PNG·모든 영역 JSON을 내보낸다', async ({ page }) => {
  await openNote(page); await stroke(note(page), 'pen', 'pointercancel');
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true'); await stroke(stem(page));
  const png = page.waitForEvent('download'); await page.getByRole('button', { name: '노트 PNG 내보내기' }).click();
  expect((await png).suggestedFilename()).toMatch(/ink-v1-.*q01.*\.png$/);
  const json = page.waitForEvent('download'); await page.getByRole('button', { name: '문항 필기 JSON 내보내기', exact: true }).click();
  const download = await json, stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.version).toBe(1); expect(exported.questionId).toContain('q01');
  expect(exported.surfaces.scratchpad.document.strokes).toHaveLength(1);
  expect(exported.surfaces.stem.document.strokes).toHaveLength(1);
  expect(exported.surfaces.stem.document.height).toBe(Number((await stem(page).getAttribute('viewBox'))!.split(' ')[3]));
  expect(exported.surfaces.statement.document.strokes).toHaveLength(0);
});

test('종료 후 읽기 전용 열람 및 새 세션 격리', async ({ page }) => {
  await openNote(page); await stroke(note(page));
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  await page.getByRole('button', { name: '세트 제출', exact: true }).click();
  await page.getByRole('button', { name: '세트 제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await openNote(page); await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await stroke(note(page)); await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '전체 지우기', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '세트 목록', exact: true }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await openNote(page); await expect(note(page).locator('[data-stroke]')).toHaveCount(0);
});

test('다른 탭 충돌은 덮어쓰지 않고 이동 후에도 복구 내보내기를 제공한다', async ({ page, context }) => {
  await openNote(page);
  const other = await context.newPage(); await other.goto('/'); await openNote(other);
  await stroke(note(page)); await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  await stroke(note(other)); await expect(other.getByRole('alert').filter({ hasText: '다른 탭' }).first()).toBeVisible();
  await expect(note(other).locator('[data-stroke]')).toHaveCount(1);
  await other.keyboard.press('ArrowRight');
  await expect(other.getByRole('button', { name: '복구 필기 JSON 내보내기' })).toBeVisible();
  await other.close(); await page.reload();
  await page.getByRole('button', { name: '1번 문항', exact: true }).click();
  await openNote(page);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
});

test('stroke 도중 문항 이동·시간 종료에도 이전 문항 필기를 보존한다', async ({ page }) => {
  await openNote(page);
  await stroke(note(page), 'pen', 'pointermove');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft'); await openNote(page);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await stroke(note(page), 'pen', 'pointermove');
  const snapshot = await study(page), session = snapshot.data.qfSessions![0];
  await page.evaluate(deadline => { Date.now = () => deadline; }, session.startedAt + 1800000);
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await openNote(page); await expect(note(page).locator('[data-stroke]')).toHaveCount(2);
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  expect((await study(page)).data.qfSessions![0]).toMatchObject({ status: 'COMPLETED', endReason: 'EXPIRED', endedAt: session.startedAt + 1800000 });
});

test('지우개·전체 지우기는 현재 영역만 변경하고 모눈·확장·좌표를 보존한다', async ({ page }) => {
  await openNote(page); await stroke(note(page));
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true'); await stroke(stem(page));
  const tools = page.getByRole('group', { name: '풀이 노트 도구', exact: true });
  await tools.getByRole('button', { name: '지우개', exact: true }).click(); await stroke(note(page));
  await expect(note(page).locator('[data-stroke]')).toHaveCount(0);
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '전체 지우기', exact: true }).click();
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '이 영역 지우기', exact: true }).click();
  await expect(note(page).locator('[data-stroke]')).toHaveCount(0);
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await page.getByLabel('노트 배경', { exact: true }).selectOption('grid');
  await page.getByRole('button', { name: '아래로 확장', exact: true }).click();
  await expect(note(page)).toHaveAttribute('viewBox', '0 0 720 1440');
  // Coordinate conversion must account for CSS scaling and scroll, not viewport coordinates.
  await page.locator('.ink-note').evaluate(el => { (el as HTMLElement).style.transform = 'scale(.85)'; });
  await tools.getByRole('button', { name: '펜', exact: true }).click();
  await stroke(note(page));
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  const points = await note(page).locator('[data-stroke]').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
  expect(points[1]).toEqual(points[0]);
  await page.reload(); await openNote(page);
  await expect(note(page)).toHaveAttribute('viewBox', '0 0 720 1440');
  await expect(page.getByLabel('노트 배경', { exact: true })).toHaveValue('grid');
});

test('저장 공간 오류는 필기를 보존하고 재시도한다', async ({ page }) => {
  await openNote(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'bio-sprint-ink') throw new DOMException('synthetic quota', 'QuotaExceededError');
      return original.apply(this, args);
    };
    (window as unknown as { restoreInkPut: () => void }).restoreInkPut = () => { IDBObjectStore.prototype.put = original; };
  });
  await stroke(note(page));
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장 실패');
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { restoreInkPut: () => void }).restoreInkPut());
  await page.getByRole('button', { name: '필기 저장 재시도', exact: true }).first().click();
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  await page.reload(); await openNote(page); await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
});

test('진행 중인 stroke를 새로고침 경고 전에 확정한다', async ({ page }) => {
  await openNote(page); await stroke(note(page), 'pen', 'pointermove');
  const warned = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented;
  });
  expect(warned).toBe(true);
  await expect(page.locator('[data-ink-status="scratchpad"]')).toContainText('필기 저장됨');
  await page.reload(); await openNote(page);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
});

test('진행 중인 stroke 확정이 도구 변경을 되돌리지 않는다', async ({ page }) => {
  await openNote(page); await stroke(note(page));
  await stroke(note(page), 'pen', 'pointermove');
  await page.getByLabel('노트 배경', { exact: true }).selectOption('grid');
  await note(page).dispatchEvent('pointerup', { pointerId: 41, pointerType: 'pen' });
  await expect(page.getByLabel('노트 배경', { exact: true })).toHaveValue('grid');
  await expect(note(page).locator('[data-stroke]')).toHaveCount(2);
});
