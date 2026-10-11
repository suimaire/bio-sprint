import type { InkPoint, InkStroke } from './model';

export type ScreenPoint = { x: number; y: number };
export const STRAIGHT_LIMITS = {
  minLength: 45, minRatio: .90, minDeviation: 5, maxDeviation: 12,
  deviationRatio: .06, backtrackRatio: .12, sampleSpacing: 1,
  minSamples: 3, cornerSpan: 8, maxTurnRadians: Math.PI / 3,
} as const;
export const pointDistance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(b.x - a.x, b.y - a.y);

// Input is already in rendered CSS pixels, never device pixels or viewBox units.
export function isStraightCandidate(input: readonly ScreenPoint[]): boolean {
  if (input.length < STRAIGHT_LIMITS.minSamples || input.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const points = [input[0]];
  for (const p of input.slice(1, -1)) if (pointDistance(points[points.length - 1], p) > STRAIGHT_LIMITS.sampleSpacing) points.push(p);
  const end = input[input.length - 1];
  if (pointDistance(points[points.length - 1], end) > STRAIGHT_LIMITS.sampleSpacing) points.push(end);
  else points[points.length - 1] = end;
  if (points.length < STRAIGHT_LIMITS.minSamples) return false;
  const start = points[0], d = pointDistance(start, end);
  if (d < STRAIGHT_LIMITS.minLength) return false;
  const ux = (end.x - start.x) / d, uy = (end.y - start.y) / d;
  const deviation = Math.min(STRAIGHT_LIMITS.maxDeviation, Math.max(STRAIGHT_LIMITS.minDeviation, STRAIGHT_LIMITS.deviationRatio * d));
  let length = 0, backtracking = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    length += Math.hypot(dx, dy);
    backtracking += Math.max(0, -(dx * ux + dy * uy));
    if (Math.abs((b.x - start.x) * uy - (b.y - start.y) * ux) > deviation) return false;
  }
  if (d / length < STRAIGHT_LIMITS.minRatio || backtracking > STRAIGHT_LIMITS.backtrackRatio * d) return false;
  // Look across a meaningful span at each vertex so sub-pixel tremor is not a corner.
  for (let i = 1; i < points.length - 1; i++) {
    let before = i - 1, after = i + 1;
    while (before > 0 && pointDistance(points[before], points[i]) < STRAIGHT_LIMITS.cornerSpan) before--;
    while (after < points.length - 1 && pointDistance(points[i], points[after]) < STRAIGHT_LIMITS.cornerSpan) after++;
    const a = points[before], b = points[i], c = points[after];
    const ab = pointDistance(a, b), bc = pointDistance(b, c);
    if (ab < STRAIGHT_LIMITS.cornerSpan || bc < STRAIGHT_LIMITS.cornerSpan) continue;
    if (((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (ab * bc) < Math.cos(STRAIGHT_LIMITS.maxTurnRadians)) return false;
  }
  return true;
}

export const pressureValue = (p: number) => Number.isFinite(p) && p > 0 ? Math.min(1, p) : .5;
const n = (v: number) => Math.round(v * 100) / 100;
export function strokePath(stroke: InkStroke): string {
  const points = stroke.points;
  if (!points.length) return '';
  const p = points[0];
  if (points.length === 1) {
    const r = stroke.tool === 'highlighter' ? stroke.width / 2 : stroke.width * (.35 + p.pressure) / 2;
    return `M ${n(p.x - r)} ${n(p.y)} a ${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
  }
  if (stroke.shape === 'line') {
    const end = points[points.length - 1];
    if (stroke.tool === 'highlighter') return `M ${n(p.x)} ${n(p.y)} L ${n(end.x)} ${n(end.y)}`;
    const dx = end.x - p.x, dy = end.y - p.y, length = Math.hypot(dx, dy);
    if (!length) return strokePath({ ...stroke, points: [p] });
    const nx = -dy / length, ny = dx / length;
    const r0 = stroke.width * (.35 + p.pressure) / 2, r1 = stroke.width * (.35 + end.pressure) / 2;
    return `M ${n(p.x + nx * r0)} ${n(p.y + ny * r0)} L ${n(end.x + nx * r1)} ${n(end.y + ny * r1)} A ${n(r1)} ${n(r1)} 0 0 0 ${n(end.x - nx * r1)} ${n(end.y - ny * r1)} L ${n(p.x - nx * r0)} ${n(p.y - ny * r0)} A ${n(r0)} ${n(r0)} 0 0 0 ${n(p.x + nx * r0)} ${n(p.y + ny * r0)} Z`;
  }
  if (stroke.tool === 'highlighter') {
    let path = `M ${n(p.x)} ${n(p.y)}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      path += ` Q ${n(a.x)} ${n(a.y)} ${n((a.x + b.x) / 2)} ${n((a.y + b.y) / 2)}`;
    }
    const end = points[points.length - 1];
    return path + ` L ${n(end.x)} ${n(end.y)}`;
  }
  const left: { x: number; y: number }[] = [], right: typeof left = [];
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const r = stroke.width * (.35 + point.pressure) / 2;
    left.push({ x: point.x - dy / length * r, y: point.y + dx / length * r });
    right.push({ x: point.x + dy / length * r, y: point.y - dx / length * r });
  });
  const outline = [...left, ...right.reverse()];
  let d = `M ${n(outline[0].x)} ${n(outline[0].y)}`;
  for (let i = 1; i <= outline.length; i++) {
    const a = outline[(i - 1) % outline.length], b = outline[i % outline.length];
    d += ` Q ${n(a.x)} ${n(a.y)} ${n((a.x + b.x) / 2)} ${n((a.y + b.y) / 2)}`;
  }
  return d + ' Z';
}
function distance(p: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function cross(a: InkPoint, b: InkPoint, c: InkPoint) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
export function hitsStroke(stroke: InkStroke, a: InkPoint, b: InkPoint, radius = 10): boolean {
  return stroke.points.some((c, i) => {
    const d = stroke.points[Math.min(i + 1, stroke.points.length - 1)];
    const crossing = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
    return crossing || Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b)) <= radius + stroke.width / 2;
  });
}
