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
const sharedTools = (page: Page) => page.getByRole('toolbar', { name: '공통 필기 도구' });

async function drawAt(page: Page, target: Locator, dx = 6, dy = 6) {
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el, dy) => window.scrollBy(0, el.getBoundingClientRect().top + dy - innerHeight * .6), dy);
  const box = (await target.boundingBox())!;
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)!;
    const send = (type: string, px: number) => {
      const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 71, pointerType: 'pen', clientX: px, clientY: y, pressure: .6, button: 0 });
      el.dispatchEvent(event); return event.defaultPrevented;
    };
    const accepted = send('pointerdown', x);
    send('pointermove', x + 15); send('pointermove', x + 30); send('pointerup', x + 40);
    // A Pencil click must never select the answer under the new transparent surface.
    el.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 71 }));
    return accepted;
  }, { x: box.x + dx, y: box.y + dy });
}

test('본문 아래와 선지 주변 여백에 쓰고 손가락 선지 선택을 통과시킨다', async ({ page }) => {
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  // The option's native target is hit, not a manually dispatched overlay event.
  expect(await drawAt(page, page.locator('[data-choice]').first())).toBe(true);
  await expect(page.locator('[data-choice]').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('svg[data-ink-surface="card"] [data-stroke]')).toHaveCount(1);
  await page.locator('[data-choice]').nth(1).tap();
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect(await drawAt(page, page.locator('.ink-card-sheet'), 8, 8)).toBe(true);
  await expect(page.locator('svg[data-ink-surface="card"] [data-stroke]')).toHaveCount(2);
  await expect(page.locator('[data-ink-status="card"]')).toContainText('필기 저장됨');
  await page.reload();
  await expect(page.locator('svg[data-ink-surface="card"] [data-stroke]')).toHaveCount(2);
  const optionPositions = () => page.locator('.ink-card-sheet .choice').evaluateAll(options => options.map(el => {
    const rect = el.getBoundingClientRect(), card = el.closest('.ink-card-sheet')!.getBoundingClientRect();
    return { x: rect.left - card.left, y: rect.top - card.top, width: rect.width, height: rect.height };
  }));
  const beforeSubmit = await optionPositions();
  await page.getByRole('button', { name: '세트 제출', exact: true }).click();
  await page.getByRole('button', { name: '세트 제출하고 결과 보기' }).click();
  await expect(page.getByRole('heading', { name: 'DAILY-15 결과', exact: true })).toBeVisible();
  await expect(page.locator('svg[data-ink-surface="card"] [data-stroke]')).toHaveCount(2);
  expect(await optionPositions()).toEqual(beforeSubmit);
  expect(await drawAt(page, page.locator('.choice').first())).toBe(false);
});

test('본문·진술 사이·좌우와 아래 여백을 연결하고 회전·노트·높이 변경에도 좌표를 유지한다', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  expect(await drawAt(page, page.locator('#qf-question-heading'), 100, 30)).toBe(true);
  const statements = page.locator('.qf-statements');
  // Gap following the first row, still on the original statement surface.
  expect(await drawAt(page, statements, 100, 47)).toBe(true);
  const sheet = page.locator('.ink-card-sheet');
  const sheetBox = (await sheet.boundingBox())!;
  expect(await drawAt(page, sheet, sheetBox.width - 50, 180)).toBe(true);
  expect(await drawAt(page, sheet, 12, 180)).toBe(true);
  expect(await drawAt(page, sheet, 60, sheetBox.height - 20)).toBe(true);
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await expect(page.locator('[data-ink-surface="statement"] [data-stroke]')).toHaveCount(1);
  await expect(page.locator('[data-ink-surface="card"] [data-stroke]')).toHaveCount(3);
  const geometry = () => page.locator('.ink-card-sheet [data-stroke]').evaluateAll(nodes => nodes.map(node => {
    const svg = node.closest('svg')!, m = svg.getScreenCTM()!, heading = document.querySelector('#qf-question-heading')!.getBoundingClientRect();
    return { d: node.getAttribute('d'), x: Math.round((m.e - heading.left) / m.a), y: Math.round((m.f - heading.top) / m.d) };
  }));
  const before = await geometry();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('.ink-card-scroll').evaluate(el => { el.scrollLeft = 80; });
  expect(await geometry()).toEqual(before);
  await openNote(page);
  await page.setViewportSize({ width: 1366, height: 1024 });
  expect(await geometry()).toEqual(before);
  await page.getByRole('button', { name: '넓게 보기', exact: true }).click();
  expect(await geometry()).toEqual(before);
  await page.getByRole('button', { name: '노트 닫기', exact: true }).click();
  await page.locator('.ink-card-sheet>.ink-annotation-text').evaluate(el => { (el as HTMLElement).style.paddingBottom = '250px'; });
  await expect(page.locator('[data-ink-status="card"]')).toContainText('필기 저장됨');
  expect(await geometry()).toEqual(before);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  await expect(page.locator('[data-ink-surface="card"] [data-stroke]')).toHaveCount(3);
  expect(Math.round((await sheet.boundingBox())!.width)).toBe(Math.round(sheetBox.width));
  expect(await geometry()).toEqual(before);
});

test('Pencil 획은 본문 경계를 지나 여백으로 이어지고 손가락은 실제 스크롤한다', async ({ page, context }) => {
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  await contact(stem(page), 'start');
  const height = Number((await stem(page).getAttribute('viewBox'))!.split(' ')[3]);
  await contact(stem(page), 'move', 650, height + 20);
  await contact(stem(page), 'pointerup', 650, height + 20);
  const path = await stem(page).locator('[data-stroke]').getAttribute('d');
  expect(path).toContain('650');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.evaluate(() => window.scrollTo(0, 300));
  const before = await page.evaluate(() => scrollY);
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 350, y: 800 }] });
  for (const y of [750, 650, 550, 450]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y }] });
    await page.waitForTimeout(25);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await page.locator('[data-choice]').nth(1).tap();
  await expect(page.locator('[data-choice]').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('경계를 넘은 획을 보이는 끝에서 지우고 원래 표면의 Undo로 복원한다', async ({ page }) => {
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  await contact(stem(page), 'start');
  await contact(stem(page), 'move', -20, 40); await contact(stem(page), 'pointerup', -20, 40);
  await sharedTools(page).getByRole('button', { name: '지우개', exact: true }).click();
  const sheet = page.locator('.ink-card-sheet');
  const offset = (await stem(page).boundingBox())!.y - (await sheet.boundingBox())!.y + 40;
  expect(await drawAt(page, sheet, 12, offset)).toBe(true);
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(0);
  await expect(sharedTools(page).locator('[data-active-surface]')).toHaveText('본문');
  await sharedTools(page).getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await sharedTools(page).getByRole('button', { name: '펜', exact: true }).click();
  expect(await drawAt(page, sheet, 12, offset + 25)).toBe(true);
  await expect(page.locator('[data-ink-surface="card"] [data-stroke]')).toHaveCount(1);
  await sharedTools(page).getByRole('button', { name: '지우개', exact: true }).click();
  expect(await drawAt(page, page.locator('.ink-annotation-sheet'), 20, 65)).toBe(true);
  await expect(page.locator('[data-ink-surface="card"] [data-stroke]')).toHaveCount(0);
  await expect(sharedTools(page).locator('[data-active-surface]')).toHaveText('여백·선지');
});

test('coalesced 손떨림 중 1000ms에 추가 move 없이 직선 미리보기를 표시한다', async ({ page }) => {
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await contact(stem(page), 'start'); await contact(stem(page), 'move', 144, 40);
  for (let i = 0; i < 9; i++) {
    await page.clock.runFor(100);
    await stem(page).evaluate((el, i) => {
      const matrix = (el as SVGSVGElement).getScreenCTM()!;
      const sample = (x: number, y: number) => {
        const p = new DOMPoint(x, y).matrixTransform(matrix);
        return new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 51, pointerType: 'pen', clientX: p.x, clientY: p.y, pressure: i % 2 ? .2 : .8 });
      };
      const e = sample(i % 2 ? 142 : 146, 40);
      Object.defineProperty(e, 'getCoalescedEvents', { value: () => [sample(144, 41), sample(143, 39)] });
      el.dispatchEvent(e);
    }, i);
  }
  await page.clock.runFor(99);
  await expect(stem(page).locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'freehand');
  await page.clock.runFor(17); // 1000ms timer plus one animation frame.
  await expect(stem(page).locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'line');
  await contact(stem(page), 'pointerup', 180, 40);
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'line');
});

for (const shape of ['circle', 'U', 'zigzag'] as const) test(`1초 정지한 ${shape} 획은 자유곡선을 유지한다`, async ({ page }) => {
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  const card = page.locator('svg[data-ink-surface="card"]');
  await expect(card).toHaveAttribute('data-ready', 'true');
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await card.evaluate((el, shape) => {
    const matrix = (el as SVGSVGElement).getScreenCTM()!;
    const points = shape === 'circle' ? Array.from({ length: 41 }, (_, i) => ({ x: 100 + 50 * Math.cos(i * Math.PI / 20), y: 100 + 50 * Math.sin(i * Math.PI / 20) })) :
      shape === 'U' ? Array.from({ length: 21 }, (_, i) => ({ x: 50 + i * 5, y: 60 + 60 * Math.sin(i * Math.PI / 20) })) :
      [{ x: 40, y: 70 }, { x: 65, y: 100 }, { x: 90, y: 40 }, { x: 115, y: 100 }, { x: 140, y: 70 }];
    points.forEach((point, i) => {
      const p = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      el.dispatchEvent(new PointerEvent(i ? 'pointermove' : 'pointerdown', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 51, clientX: p.x, clientY: p.y, button: 0, pressure: .6 }));
    });
  }, shape);
  await page.clock.runFor(1017);
  await expect(card.locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'freehand');
  await contact(card, 'pointerup');
  await expect(card.locator('[data-stroke]')).toHaveAttribute('data-shape', 'freehand');
});

async function contact(canvas: Locator, phase: 'start' | 'move' | 'pointerup' | 'pointercancel' | 'lostpointercapture', x = 140, y = 40) {
  await canvas.evaluate((el, { phase, x, y }) => {
    const matrix = (el as SVGSVGElement).getScreenCTM()!;
    const send = (name: string, px: number, py: number) => {
      const p = new DOMPoint(px, py).matrixTransform(matrix);
      el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, pointerId: 51, pointerType: 'pen', clientX: p.x, clientY: p.y, button: 0, buttons: name === 'pointerup' ? 0 : 1, pressure: .6 }));
    };
    if (phase === 'start') {
      send('pointerdown', 40, 40);
      for (let i = 1; i <= 10; i++) send('pointermove', 40 + i * 10, 40 + (i === 10 ? 0 : i % 2));
    } else send(phase === 'move' ? 'pointermove' : phase, x, y);
  }, { phase, x, y });
}
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

test('공통 툴바 하나로 세 표면을 그리고 도구별 색상과 독립 Undo를 유지한다', async ({ page }) => {
  await page.keyboard.press('ArrowRight'); await openNote(page);
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  const tools = sharedTools(page);
  await expect(tools).toHaveCount(1);
  await tools.getByRole('button', { name: '펜', exact: true }).click();
  await tools.getByRole('button', { name: '파랑', exact: true }).click();
  await stroke(stem(page));
  await expect(tools.locator('[data-active-surface]')).toHaveText('본문');
  const statement = page.locator('svg[data-ink-surface="statement"]');
  await stroke(statement); await stroke(note(page));
  for (const canvas of [stem(page), statement, note(page)]) {
    await expect(canvas.locator('[data-stroke]')).toHaveCount(1);
    await expect(canvas.locator('[data-stroke]')).toHaveAttribute('fill', '#245FBD');
  }
  await tools.getByRole('button', { name: '형광펜', exact: true }).click();
  await tools.getByRole('button', { name: '색상 및 굵기', exact: true }).click();
  await tools.getByRole('button', { name: '분홍', exact: true }).click();
  await stroke(note(page));
  await expect(note(page).locator('[data-stroke]').last()).toHaveAttribute('stroke', '#FF95B8');
  await tools.getByRole('button', { name: '펜', exact: true }).click(); await stroke(statement);
  await expect(statement.locator('[data-stroke]').last()).toHaveAttribute('fill', '#245FBD');
  await stroke(stem(page), 'touch');
  await expect(tools.locator('[data-active-surface]')).toHaveText('진술');
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(statement.locator('[data-stroke]')).toHaveCount(1);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(2);
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '형광펜', exact: true }).click(); await stroke(stem(page));
  await expect(stem(page).locator('[data-stroke]').last()).toHaveAttribute('stroke', '#FF95B8');
});

test('누른 채 직선 미리보기·끝점 조정·두 단계 Undo와 재로드', async ({ page }) => {
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await contact(stem(page), 'start');
  await page.clock.runFor(999);
  await expect(stem(page).locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'freehand');
  await page.clock.runFor(17);
  await expect(stem(page).locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'line');
  await contact(stem(page), 'move', 190, 60); await page.clock.runFor(17);
  await contact(stem(page), 'pointerup', 200, 55);
  const tools = sharedTools(page);
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'line');
  await expect(page.locator('[data-ink-status="stem"]')).toContainText('필기 저장됨');
  const json = page.waitForEvent('download'); await page.getByRole('button', { name: '문항 필기 JSON 내보내기', exact: true }).click();
  const stream = await (await json).createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const saved = JSON.parse(Buffer.concat(chunks).toString()).surfaces.stem;
  expect(saved.revision).toBe(1);
  expect(saved.document.strokes[0].points.map(({ x, y }: { x: number; y: number }) => ({ x, y }))).toEqual([{ x: 40, y: 40 }, { x: 200, y: 55 }]);
  expect(saved.document.strokes[0].points[1].pressure).toBeCloseTo(.6);
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'freehand');
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(0);
  await tools.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'freehand');
  await tools.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'line');
  await expect(page.locator('[data-ink-status="stem"]')).toContainText('필기 저장됨');
  await page.reload();
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'line');
});

test('조기 종료·중단·Undo 뒤에 Hold 타이머가 필기를 다시 만들지 않는다', async ({ page }) => {
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await expect(stem(page)).toHaveAttribute('data-ready', 'true');
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await contact(stem(page), 'start'); await page.clock.runFor(700);
  await contact(stem(page), 'pointerup'); await page.clock.runFor(1500);
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'freehand');
  const interruptions = ['pointercancel', 'lostpointercapture', 'pagehide', 'visibilitychange', 'tool', 'disable', 'undo'] as const;
  for (const interruption of interruptions) {
    await contact(stem(page), 'start'); await page.clock.runFor(1016);
    await expect(stem(page).locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'line');
    if (interruption === 'pointercancel' || interruption === 'lostpointercapture') await contact(stem(page), interruption);
    else if (interruption === 'pagehide') await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    else if (interruption === 'visibilitychange') await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    });
    else if (interruption === 'tool') {
      await sharedTools(page).getByRole('button', { name: '형광펜', exact: true }).click();
      await sharedTools(page).getByRole('button', { name: '펜', exact: true }).click();
    } else if (interruption === 'disable') {
      await page.getByRole('button', { name: '지문 필기', exact: true }).click();
      await page.getByRole('button', { name: '지문 필기', exact: true }).click();
    } else await sharedTools(page).getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(stem(page).locator('[data-ink-preview]')).toHaveCount(0);
    const count = await stem(page).locator('[data-stroke]').count();
    await page.clock.runFor(1500);
    await expect(stem(page).locator('[data-stroke]')).toHaveCount(count);
    await expect(stem(page).locator('[data-shape="line"]')).toHaveCount(0);
  }
});

test('표면 전환과 unmount는 직선 후보의 원본을 보존하고 새 표면의 첫 획을 받는다', async ({ page }) => {
  await openNote(page); await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await contact(stem(page), 'start'); await page.clock.runFor(1016);
  await expect(stem(page).locator('[data-ink-preview] path')).toHaveAttribute('data-shape', 'line');
  await contact(note(page), 'start');
  await expect(stem(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'freehand');
  await expect(sharedTools(page).locator('[data-active-surface]')).toHaveText('노트');
  await page.clock.runFor(1016); await contact(note(page), 'pointerup');
  await expect(note(page).locator('[data-stroke]')).toHaveAttribute('data-shape', 'line');
  const png = page.waitForEvent('download'); await page.getByRole('button', { name: '노트 PNG 내보내기' }).click();
  const stream = await (await png).createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  await contact(note(page), 'start'); await page.clock.runFor(1016);
  await page.keyboard.press('ArrowRight'); await page.clock.runFor(1500);
  await page.keyboard.press('ArrowLeft'); await openNote(page);
  await expect(note(page).locator('[data-stroke]')).toHaveCount(2);
  await expect(note(page).locator('[data-stroke]').last()).toHaveAttribute('data-shape', 'freehand');
});

test('1024·1366·세로·좁은 화면에서 툴바가 답안을 가리지 않고 본문 위치를 유지한다', async ({ page }) => {
  const heading = page.locator('#qf-question-heading');
  const before = await heading.boundingBox();
  await page.getByRole('button', { name: '지문 필기', exact: true }).click();
  const after = await heading.boundingBox(); expect(after!.y).toBe(before!.y); expect(after!.x).toBe(before!.x);
  await openNote(page);
  await expect(page.locator('.ink-note [role="toolbar"]')).toHaveCount(0);
  for (const width of [1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 768 : 1024 });
    await expect(sharedTools(page)).toHaveCount(1);
    const toolbar = await sharedTools(page).boundingBox(), question = await page.locator('.ink-question-content').boundingBox();
    expect(toolbar!.width).toBe(54); expect(toolbar!.x).toBeGreaterThan(12);
    expect(toolbar!.x + toolbar!.width).toBeLessThan(question!.x);
    for (const button of await sharedTools(page).getByRole('button').all()) {
      const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1024) {
      const box = await page.locator('.ink-note').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(question!.x + question!.width);
      expect(question!.width).toBeGreaterThan(300); expect(box!.width).toBeGreaterThanOrEqual(320);
    }
    await page.locator('[data-choice]').first().click();
    await expect(page.locator('[data-choice]').first()).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '확신도 5', exact: true }).click();
    await expect(page.getByRole('button', { name: '다음 문항 →', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => window.scrollTo(0, 360));
  const top = await sharedTools(page).boundingBox(), header = await page.locator('.exam-toolbar').boundingBox();
  expect(top!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await page.screenshot({ path: 'verification.local/ink-1024.png' });
  await page.getByRole('button', { name: '넓게 보기', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  const tools = sharedTools(page);
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
  const tools = sharedTools(page);
  await tools.getByRole('button', { name: '지우개', exact: true }).click(); await stroke(note(page));
  await expect(note(page).locator('[data-stroke]')).toHaveCount(0);
  await expect(stem(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(note(page).locator('[data-stroke]')).toHaveCount(1);
  await tools.getByRole('button', { name: '필기 설정', exact: true }).click();
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
