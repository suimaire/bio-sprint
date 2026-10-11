import type { InkPoint, InkStroke } from './model';

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
