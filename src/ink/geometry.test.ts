import { describe, expect, it } from 'vitest';
import { hitsStroke, pressureValue, strokePath } from './geometry';
import type { InkStroke } from './model';

const stroke: InkStroke = { id: 'one', tool: 'pen', width: 3, color: '#202923', points: [{ x: 0, y: 50, pressure: .5 }, { x: 100, y: 50, pressure: .5 }] };
describe('ink geometry', () => {
  it('erases a sparse stroke crossed between pointer samples', () => {
    expect(hitsStroke(stroke, { x: 50, y: 0, pressure: .5 }, { x: 50, y: 100, pressure: .5 })).toBe(true);
    expect(hitsStroke(stroke, { x: 130, y: 0, pressure: .5 }, { x: 130, y: 100, pressure: .5 })).toBe(false);
  });
  it('falls back when pressure is missing, zero or invalid', () => {
    expect([0, NaN, -1].map(pressureValue)).toEqual([.5, .5, .5]);
    expect(pressureValue(.8)).toBe(.8);
  });
  it('renders a tap and variable pressure without invalid SVG coordinates', () => {
    expect(strokePath({ ...stroke, points: [stroke.points[0]] })).toContain('a');
    expect(strokePath(stroke)).not.toMatch(/NaN|Infinity/);
    expect(strokePath({ ...stroke, points: stroke.points.map(p => ({ ...p, pressure: 1 })) })).not.toBe(strokePath(stroke));
  });
});
