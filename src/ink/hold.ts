import { classifyStraightCandidate, pointDistance, type GeometryResult, type ScreenPoint } from './geometry';
import type { InkPoint, InkStroke } from './model';

export const HOLD_DURATION_MS = 1000;
export const JITTER_IGNORE_PX = 2;
export const MEANINGFUL_MOVE_PX = 6;
export const ENDPOINT_STABILITY_RADIUS_PX = 8;
export type HoldResult = 'HOLD_NOT_REACHED' | 'HOLD_UNSTABLE' | 'HOLD_REACHED_GEOMETRY_REJECTED' | 'HOLD_REACHED_LINE_ACCEPTED';
export type StrokeCommit = { stroke: InkStroke; original?: InkStroke };

// One instance per live contact. React renders never own or restart this timer.
export class HoldToStraight {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private anchor: InkPoint;
  private endpoint: InkPoint;
  private lastMovement = performance.now();
  private candidateCount = 1;
  private checked = false;
  private locked = false;
  private ended = false;
  private moved = false;
  result: HoldResult = 'HOLD_NOT_REACHED';
  geometry: GeometryResult | null = null;
  constructor(private readonly original: InkStroke, private readonly project: (p: InkPoint) => ScreenPoint,
    private readonly repaint: () => void, private readonly enabled = true) {
    this.anchor = this.endpoint = original.points[0];
  }
  get preview(): InkStroke {
    return this.locked ? { ...this.original, shape: 'line', points: [this.original.points[0], this.endpoint] } : this.original;
  }
  append(p: InkPoint) {
    if (this.ended) return;
    this.endpoint = p;
    if (this.locked) return;
    const last = this.original.points[this.original.points.length - 1];
    if (pointDistance(this.project(last), this.project(p)) >= .3) this.original.points.push(p);
    const movement = pointDistance(this.project(this.anchor), this.project(p));
    // Compare with a fixed anchor, not with the previous coalesced sample.
    // Once a meaningful stroke exists, the entire stability disk is respected.
    if (movement > JITTER_IGNORE_PX && (!this.moved ? movement >= MEANINGFUL_MOVE_PX : movement > ENDPOINT_STABILITY_RADIUS_PX)) {
      this.result = this.moved ? 'HOLD_UNSTABLE' : 'HOLD_NOT_REACHED';
      this.moved = true; this.geometry = null;
      this.anchor = p; this.lastMovement = performance.now();
      this.candidateCount = this.original.points.length; this.checked = false; this.clearTimer();
    }
    this.arm();
  }
  private clearTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private arm() {
    if (!this.enabled || this.ended || this.checked || this.timer !== undefined || !this.moved) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.ended || this.locked) return;
      if (performance.now() - this.lastMovement < HOLD_DURATION_MS) { this.arm(); return; }
      this.checked = true;
      if (pointDistance(this.project(this.anchor), this.project(this.endpoint)) > ENDPOINT_STABILITY_RADIUS_PX) { this.result = 'HOLD_UNSTABLE'; this.repaint(); return; }
      // Exclude only the stationary tail from classification; keep every original sample for Undo.
      const candidate = this.original.points.slice(0, this.candidateCount);
      candidate[candidate.length - 1] = this.endpoint;
      this.geometry = classifyStraightCandidate(candidate.map(this.project));
      this.locked = this.geometry === 'LINE_ACCEPTED';
      this.result = this.locked ? 'HOLD_REACHED_LINE_ACCEPTED' : 'HOLD_REACHED_GEOMETRY_REJECTED';
      this.repaint();
    }, Math.max(0, HOLD_DURATION_MS - (performance.now() - this.lastMovement)));
  }
  finish(normalPointerUp: boolean): StrokeCommit {
    this.clearTimer(); this.ended = true;
    if (this.locked && normalPointerUp) return { stroke: this.preview, original: this.original };
    this.locked = false;
    return { stroke: this.original };
  }
}
