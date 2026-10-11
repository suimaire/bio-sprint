import { test, expect, type Page } from '@playwright/test';
import { fixture } from './fixtures/qf';
import type { Snapshot } from '../src/storage';

test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });
async function study(page: Page): Promise<Snapshot> {
  return page.evaluate(() => new Promise<Snapshot>((resolve, reject) => {
    const r = indexedDB.open('bio-sprint', 1);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('study'), q = tx.objectStore('study').get('current'); tx.oncomplete = () => { resolve(q.result); db.close(); }; tx.onabort = () => reject(tx.error); };
  }));
}
async function start(page: Page) {
  await page.goto('/question-factory');
  await page.getByLabel('QF JSON 파일').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())) });
  await page.getByRole('button', { name: '가져오기 적용' }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.locator('#qf-question-heading')).toBeVisible();
}
async function ink(page: Page, surface = 'stem', finish = true) {
  const canvas = page.locator(`svg[data-ink-surface="${surface}"]`);
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await canvas.evaluate((el, finish) => {
    const m = (el as SVGSVGElement).getScreenCTM()!;
    for (const [name, x, y] of [['pointerdown', 40, 30], ['pointermove', 160, 40], ...(finish ? [['pointerup', 180, 40]] : [])] as [string, number, number][]) {
      const p = new DOMPoint(x, y).matrixTransform(m);
      el.dispatchEvent(new PointerEvent(name, { bubbles: true, pointerId: 41, pointerType: 'pen', clientX: p.x, clientY: p.y, pressure: .6, button: 0, buttons: 1 }));
    }
  }, finish);
}

test('pause freezes persisted time, blocks input, reloads ink and resumes the same visit', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-11T03:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-11T03:00:00Z'));
  await start(page);
  await page.keyboard.press('A'); await page.keyboard.press('4');
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await ink(page, 'stem', false);
  await page.clock.fastForward(300000);
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByText('훈련이 일시정지되었습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('25:00');
  await expect.poll(async () => (await study(page)).data.qfSessions![0].status).toBe('PAUSED');
  await page.clock.fastForward(600000);
  await page.keyboard.press('B'); await page.keyboard.press('1'); await page.keyboard.press('ArrowRight');
  expect((await study(page)).data.qfResponses![0]).toMatchObject({ selectedOption: 'A', confidence: 4, visitCount: 1 });
  await page.reload();
  await expect(page.getByText('훈련이 일시정지되었습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('25:00');
  await page.getByRole('button', { name: '훈련 취소', exact: true }).click();
  await page.getByRole('button', { name: '계속 풀기', exact: true }).click();
  await expect(page.getByText('훈련이 일시정지되었습니다.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이어서 풀기', exact: true }).click();
  await expect(page.getByRole('button', { name: '일시정지', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(page.locator('svg[data-ink-surface="stem"] [data-stroke]')).toHaveCount(1);
  await page.clock.fastForward(180000);
  await expect(page.getByRole('timer')).toHaveText('22:00');
  await page.keyboard.press('B');
  await expect.poll(async () => (await study(page)).data.qfResponses![0].selectedOption).toBe('B');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect.poll(async () => (await study(page)).data.qfResponses![0].responseTimeMs).toBe(480000);
  expect((await study(page)).data.qfResponses![0]).toMatchObject({ visitCount: 1, answerChangeCount: 1 });
});

for (const paused of [false, true]) test(`cancel ${paused ? 'PAUSED' : 'ACTIVE'} deletes all surfaces and preserves package and completed history`, async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '지문 필기', exact: true }).click(); await ink(page);
  await page.getByRole('button', { name: '세트 제출', exact: true }).click();
  await page.getByRole('button', { name: '세트 제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  const prior = await study(page);
  await page.getByRole('link', { name: '세트 목록', exact: true }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.locator('#qf-question-heading')).toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('A'); await page.keyboard.press('3');
  await expect(page.locator('#qf-question-heading')).toHaveText('테스트 문항 2');
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await page.getByRole('button', { name: '풀이 노트', exact: true }).click();
  for (const surface of ['stem', 'statement', 'scratchpad']) await ink(page, surface);
  const target = (await study(page)).data.qfSessions!.find(s => s.status === 'ACTIVE')!.id;
  if (paused) { await page.getByRole('button', { name: '일시정지', exact: true }).click(); await expect(page.getByText('훈련이 일시정지되었습니다.', { exact: true })).toBeVisible(); }
  await page.getByRole('button', { name: '훈련 취소', exact: true }).click();
  await page.getByRole('button', { name: '훈련 취소하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 세트 훈련' })).toBeVisible();
  const after = await study(page);
  expect(after.data).toEqual(prior.data);
  const records = await page.evaluate(() => new Promise<{ key?: { sessionId: string } }[]>(resolve => {
    const r = indexedDB.open('bio-sprint-ink', 1); r.onsuccess = () => { const db = r.result, tx = db.transaction('surfaces'), q = tx.objectStore('surfaces').getAll(); tx.oncomplete = () => { resolve(q.result); db.close(); }; };
  }));
  expect(records.filter(r => r.key?.sessionId === target)).toHaveLength(0);
  expect(records.filter(r => r.key?.sessionId === prior.data.qfSessions![0].id)).toHaveLength(1);
  await page.reload();
  await page.goto('/qf-session/' + encodeURIComponent(prior.data.qfSessions![0].id));
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '세트 목록', exact: true }).click();
  await page.getByRole('button', { name: 'DAILY-15 시작 · 30분' }).click();
  await expect(page.locator('#qf-question-heading')).toBeVisible();
  expect((await study(page)).data.qfSessions!.at(-1)!.id).not.toBe(target);
});

test('cancel dialog keeps ACTIVE time running and dismissing does not pause', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-11T03:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-11T03:00:00Z'));
  await start(page);
  await page.getByRole('button', { name: '훈련 취소', exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(page.getByRole('timer')).toHaveText('29:50');
  await page.getByRole('button', { name: '계속 풀기', exact: true }).click();
  expect((await study(page)).data.qfSessions![0].status).toBe('ACTIVE');
});

test('a long pause never auto-submits, but resumed active time expires normally', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-11T03:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-11T03:00:00Z'));
  await start(page);
  await page.clock.fastForward(300000);
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByRole('button', { name: '이어서 풀기', exact: true })).toBeEnabled();
  await page.clock.fastForward(7200000);
  await expect(page.getByRole('timer')).toHaveText('25:00');
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '이어서 풀기', exact: true }).click();
  await expect(page.getByRole('button', { name: '일시정지', exact: true })).toBeEnabled();
  await page.clock.fastForward(1500000);
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  const saved = await study(page);
  expect(saved.data.qfSessions![0]).toMatchObject({ status: 'COMPLETED', endReason: 'EXPIRED', pausedDurationMs: 7200000 });
  expect(saved.data.qfResponses![0]).toMatchObject({ responseTimeMs: 1800000, visitCount: 1 });
  await expect(page.getByText(/풀이 시간 1800.0초/)).toBeVisible();
});

test('ink deletion failure stays locked, survives restart and retries without recreating data', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await page.getByRole('button', { name: '지문 필기', exact: true }).click(); await ink(page);
  await expect(page.locator('[data-ink-status="stem"]')).toContainText('필기 저장됨');
  await page.evaluate(() => {
    const remove = IDBCursor.prototype.delete;
    IDBCursor.prototype.delete = function() { const r = remove.call(this); if (this.source instanceof IDBObjectStore && this.source.transaction.db.name === 'bio-sprint-ink') this.source.transaction.abort(); return r; };
  });
  await page.getByRole('button', { name: '훈련 취소', exact: true }).click();
  await page.getByRole('button', { name: '훈련 취소하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '취소 삭제 재시도', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'DAILY-15 세트 훈련' })).toHaveCount(0);
  expect((await study(page)).data.qfSessions).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'DAILY-15 세트 훈련' })).toBeVisible();
  await expect(page.getByText('복구 필기 JSON 내보내기', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('real IndexedDB cancellation rejects stale writes and drains ink caches while preserving other training', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const storagePath = '/src/storage.ts', enginePath = '/src/qfEngine.ts', sessionsPath = '/src/sessionEngine.ts', inkPath = '/src/ink/storage.ts', storePath = '/src/ink/store.ts', modelPath = '/src/ink/model.ts', recoveryPath = '/src/qfCancellation.ts';
    const storage = await import(storagePath), engine = await import(enginePath), sessions = await import(sessionsPath), ink = await import(inkPath), stores = await import(storePath), model = await import(modelPath), recovery = await import(recoveryPath);
    let value = await storage.loadData();
    const completedId = value.data.qfSessions[0].id;
    let data = engine.actQF(value.data, completedId, { type: 'finish' }, Date.now());
    data = sessions.createSession(data, { mode: 'RECALL', count: 1, timeLimitSec: 60, includeDrafts: true }, Date.now(), 'ordinary');
    data = sessions.act(data, 'ordinary', { type: 'finish' }, Date.now());
    const keep = structuredClone(data);
    data = engine.startQF(data, 'test-run', Date.now(), 'delete-target');
    value = await storage.saveData(data, value.revision);
    const key = model.inkKey({ sessionId: 'delete-target', runId: 'test-run', questionId: data.qfSessions.at(-1).questionIds[0] }, 'scratchpad');
    const otherKey = { ...key, sessionId: completedId };
    await ink.saveInk(otherKey, model.emptyDocument('scratchpad'), 0);
    const store = stores.getInkStore(key); await store.load();
    store.change((d: { height: number }) => ({ ...d, height: 1440 }));
    const stale = await storage.beginQFCancellation('delete-target', value.revision - 1).then(() => false, () => true);
    const unchanged = (await storage.loadData()).data.qfSessions.length === 2;
    // Start another real autosave, then delete before awaiting it.
    store.change((d: { height: number }) => ({ ...d, height: 1920 }));
    const marked = await storage.beginQFCancellation('delete-target', value.revision);
    const blockedStudy = await storage.saveData(data, marked.revision).then(() => false, () => true);
    await recovery.recoverQFCancellations(marked);
    const current = await storage.loadData();
    const blockedInk = await ink.saveInk(key, model.emptyDocument('scratchpad'), 0).then(() => false, () => true);
    store.change((d: { height: number }) => ({ ...d, height: 2400 })); await store.flush();
    const again = await storage.beginQFCancellation('delete-target', -1); await recovery.recoverQFCancellations(again);
    const completedProtected = await storage.beginQFCancellation(completedId, current.revision).then(() => false, () => true);
    return { stale, unchanged, blockedStudy, blockedInk, completedProtected, data: current.data, keep,
      inkGone: await ink.readInk(key) === undefined, otherInk: !!await ink.readInk(otherKey),
      cacheCount: stores.inkStores().filter((s: { key: { sessionId: string } }) => s.key.sessionId === 'delete-target').length,
      pending: current.qfCancellations.some((m: { pending: boolean }) => m.pending) };
  });
  expect(result).toMatchObject({ stale: true, unchanged: true, blockedStudy: true, blockedInk: true, completedProtected: true, inkGone: true, otherInk: true, cacheCount: 0, pending: false });
  expect(result.data).toEqual(result.keep);
});

test('study transaction failure rolls back deletion intent and retry succeeds', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const r = put.call(this, value, key);
      if (this.name === 'study' && key === 'qf-cancellations') { IDBObjectStore.prototype.put = put; this.transaction.abort(); }
      return r;
    };
  });
  const before = await study(page);
  await page.getByRole('button', { name: '훈련 취소', exact: true }).click();
  await page.getByRole('button', { name: '훈련 취소하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '취소 삭제 재시도', exact: true })).toBeVisible();
  expect((await study(page)).data).toEqual(before.data);
  await page.getByRole('button', { name: '취소 삭제 재시도', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 세트 훈련' })).toBeVisible();
  expect((await study(page)).data.qfSessions).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('other tab cancellation clears a failed answer buffer and its ink instead of offering recovery', async ({ page, context }) => {
  await start(page);
  await page.getByRole('button', { name: '7번 문항', exact: true }).click();
  await expect.poll(async () => (await study(page)).data.qfSessions![0].cursor).toBe(6);
  const second = await context.newPage(); await second.goto('/question-factory');
  await expect(second.getByLabel('단답형 답안', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) { const r = put.call(this, value, key); if (this.name === 'study' && key === 'current') this.transaction.abort(); return r; };
  });
  await page.getByLabel('단답형 답안', { exact: true }).fill('취소하면 버릴 임시 답안');
  await expect(page.getByRole('button', { name: '임시 기록 내보내기', exact: true })).toBeVisible();
  await second.getByRole('button', { name: '훈련 취소', exact: true }).click();
  await second.getByRole('button', { name: '훈련 취소하기', exact: true }).click();
  await expect(second.getByRole('heading', { name: 'DAILY-15 세트 훈련' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'DAILY-15 세트 훈련' })).toBeVisible();
  await expect(page.getByRole('button', { name: '임시 기록 내보내기', exact: true })).toHaveCount(0);
  expect((await study(second)).data.qfResponses).toHaveLength(0);
});
