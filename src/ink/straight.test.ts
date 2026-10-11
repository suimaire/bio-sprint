import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStraightCandidate } from './geometry';
import { HoldToStraight } from './hold';
import type { InkPoint, InkStroke } from './model';

const point = (x: number, y = 0): InkPoint => ({ x, y, pressure: .6 });
const wavy = Array.from({ length: 11 }, (_, i) => point(i * 10, i === 0 || i === 10 ? 0 : i % 2));
const curves = {
  circle: Array.from({ length: 41 }, (_, i) => point(50 + 50 * Math.cos(i * Math.PI / 20), 50 + 50 * Math.sin(i * Math.PI / 20))),
  ellipse: Array.from({ length: 41 }, (_, i) => point(80 * Math.cos(i * Math.PI / 20), 25 * Math.sin(i * Math.PI / 20))),
  U: Array.from({ length: 21 }, (_, i) => point(i * 5, 60 * Math.sin(i * Math.PI / 20))),
  S: Array.from({ length: 21 }, (_, i) => point(i * 5, 25 * Math.sin(i * Math.PI / 10))),
  zigzag: [point(0), point(25, 15), point(50, -15), point(75, 15), point(100)],
  short: [point(0), point(10), point(20)],
  backtrack: [point(0), point(60), point(35), point(100)],
  corner: [point(0), point(75), point(75, 10), point(200)],
};
describe('CSS-pixel straight candidate', () => {
  it.each([0, Math.PI / 2, Math.PI / 4])('accepts a shaky line rotated by %s', angle => {
    expect(isStraightCandidate(wavy.map(p => point(p.x * Math.cos(angle) - p.y * Math.sin(angle), p.x * Math.sin(angle) + p.y * Math.cos(angle))))).toBe(true);
  });
  it.each(Object.entries(curves))('rejects %s', (_, points) => expect(isStraightCandidate(points)).toBe(false));
  it('requires length and distinct samples, and bounds lateral deviation', () => {
    expect(isStraightCandidate([point(0), point(20), point(44.9)])).toBe(false);
    expect(isStraightCandidate([point(0), point(20), point(45)])).toBe(true);
    expect(isStraightCandidate([point(0), point(0), point(100)])).toBe(false);
    expect(isStraightCandidate([point(0), point(50, 6), point(100)])).toBe(true);
    expect(isStraightCandidate([point(0), point(50, 6.1), point(100)])).toBe(false);
  });
});

function gesture(points = wavy, scale = 1, tool: InkStroke['tool'] = 'pen') {
  const stroke: InkStroke = { id: 'test', tool, color: '#245FBD', width: 3.5, points: [points[0]] };
  const g = new HoldToStraight(stroke, p => point(p.x * scale, p.y * scale), () => {});
  for (const p of points.slice(1)) g.append(p);
  return g;
}
afterEach(() => vi.useRealTimers());
describe('contact-only hold (monotonic fake time)', () => {
  it.each(['pen', 'highlighter'] as const)('previews at 1000ms then commits %s on normal lift', tool => {
    vi.useFakeTimers(); const g = gesture(wavy, 1, tool);
    vi.advanceTimersByTime(999); expect(g.preview.shape).toBeUndefined();
    vi.advanceTimersByTime(1); expect(g.preview.shape).toBe('line');
    const result = g.finish(true);
    expect(result.stroke.points).toEqual([point(0), point(100)]);
    expect(result.original?.points).toEqual(wavy);
    expect(result.stroke).toMatchObject({ shape: 'line', color: '#245FBD', width: 3.5, tool });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not straighten after a 700ms lift', () => {
    vi.useFakeTimers(); const g = gesture(); vi.advanceTimersByTime(700);
    const result = g.finish(true); vi.advanceTimersByTime(2000);
    expect(result.stroke.shape).toBeUndefined(); expect(result.original).toBeUndefined();
    expect(g.preview.shape).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(Object.entries(curves))('holds %s without changing it', (_, points) => {
    vi.useFakeTimers(); const g = gesture(points); vi.advanceTimersByTime(1500);
    expect(g.finish(true).stroke.shape).toBeUndefined();
  });
  it('ignores repeated 1–2px endpoint jitter without polluting path geometry', () => {
    vi.useFakeTimers(); const g = gesture();
    for (let i = 0; i < 9; i++) { vi.advanceTimersByTime(100); g.append(point(100 + (i % 2 ? 1 : -1), i % 2)); }
    vi.advanceTimersByTime(100); expect(g.preview.shape).toBe('line');
    expect(g.finish(true).original!.points.length).toBeGreaterThan(11);
  });
  it('resets for 10px motion and for cumulative sub-3px movement', () => {
    vi.useFakeTimers(); const g = gesture(); vi.advanceTimersByTime(900); g.append(point(110));
    vi.advanceTimersByTime(999); expect(g.preview.shape).toBeUndefined();
    vi.advanceTimersByTime(1); expect(g.preview.shape).toBe('line'); g.finish(true);
    const slow = gesture(); vi.advanceTimersByTime(400); slow.append(point(101));
    vi.advanceTimersByTime(400); slow.append(point(102));
    vi.advanceTimersByTime(100); slow.append(point(103));
    vi.advanceTimersByTime(999); expect(slow.preview.shape).toBeUndefined();
    vi.advanceTimersByTime(1); expect(slow.preview.shape).toBe('line'); slow.finish(true);
  });
  it('adjusts only the endpoint once locked and keeps original data bounded', () => {
    vi.useFakeTimers(); const g = gesture(); vi.advanceTimersByTime(1000);
    for (let i = 0; i < 500; i++) g.append(point(120 + i / 10, 40));
    expect(g.preview.points).toEqual([point(0), point(169.9, 40)]);
    const result = g.finish(true);
    expect(result.original?.points).toEqual(wavy); expect(result.stroke.points).toHaveLength(2);
  });
  it.each([500, 1100])('cancels safely at %sms, preserving freehand only', ms => {
    vi.useFakeTimers(); const g = gesture(); vi.advanceTimersByTime(ms);
    expect(g.finish(false).stroke.points).toEqual(wavy);
    vi.advanceTimersByTime(5000); expect(g.preview.shape).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
  it('uses actual CSS scale for the 45px minimum, while preserving stored points', () => {
    vi.useFakeTimers(); const small = gesture(wavy, .4), large = gesture(wavy, .5);
    vi.advanceTimersByTime(1000);
    expect(small.finish(true).stroke.shape).toBeUndefined();
    expect(large.finish(true).stroke.points).toEqual([point(0), point(100)]);
    expect(large.preview.shape).toBe('line');
  });
});
