import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { hitsStroke, pressureValue, strokePath } from './geometry';
import type { InkDocument, InkPoint, InkStroke, InkSurface, InkTools } from './model';
import { finishInkGestures, registerInkGesture } from './gestures';
import { HoldToStraight, type StrokeCommit } from './hold';

export const InkStrokePath = memo(function InkStrokePath({ stroke }: { stroke: InkStroke }) {
  const highlight = stroke.tool === 'highlighter', tap = stroke.points.length === 1;
  return <path data-stroke={stroke.id} data-shape={stroke.shape ?? 'freehand'} d={strokePath(stroke)} fill={highlight && !tap ? 'none' : stroke.color}
    stroke={highlight && !tap ? stroke.color : 'none'} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={highlight ? .28 : 1}/>;
});
type Props = { document: InkDocument; surface: InkSurface; tools: InkTools; enabled: boolean; ready: boolean; height?: number;
  onActive: () => void; onStroke: (commit: StrokeCommit, height: number) => void;
  onChange: (update: (document: InkDocument) => InkDocument) => void };
export function InkCanvas({ document: doc, surface, tools, enabled, ready, height = doc.height, onChange, onStroke, onActive }: Props) {
  const svg = useRef<SVGSVGElement>(null), gridId = useId().replace(/:/g, '');
  const props = useRef({ doc, tools, enabled, ready, height, onChange, onStroke, onActive }); props.current = { doc, tools, enabled, ready, height, onChange, onStroke, onActive };
  const active = useRef<{ id: number; gesture: HoldToStraight | null; base: InkDocument; erased: Set<string>; eraser: boolean; last: InkPoint } | null>(null);
  const interrupt = useRef(() => {});
  useLayoutEffect(() => { interrupt.current(); }, [tools, enabled, ready]);
  const [preview, setPreview] = useState<{ stroke: InkStroke | null; erased: Set<string> }>({ stroke: null, erased: new Set() });
  useEffect(() => {
    const element = svg.current!;
    let frame = 0;
    const paint = () => { frame = 0; const a = active.current, s = a?.gesture?.preview; setPreview({ stroke: s ? { ...s, points: [...s.points] } : null, erased: new Set(a?.erased) }); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const point = (event: PointerEvent): InkPoint | null => {
      const matrix = element.getScreenCTM(); if (!matrix) return null;
      let p: DOMPoint;
      try { p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); } catch { return null; }
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return { x: Math.max(0, Math.min(props.current.doc.width, p.x)), y: Math.max(0, Math.min(props.current.height, p.y)), pressure: event.type === 'pointerup' && !event.pressure ? active.current?.last.pressure ?? .5 : pressureValue(event.pressure) };
    };
    const screenPoint = (p: InkPoint) => {
      const matrix = element.getScreenCTM();
      return matrix ? new DOMPoint(p.x, p.y).matrixTransform(matrix) : { x: NaN, y: NaN };
    };
    const finish = (normalPointerUp = false) => {
      const a = active.current; if (!a) return;
      active.current = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      if (a.gesture) props.current.onStroke(a.gesture.finish(normalPointerUp), props.current.height);
      else if (a.erased.size) props.current.onChange(current => ({ ...current, strokes: current.strokes.filter(s => !a.erased.has(s.id)) }));
      setPreview({ stroke: null, erased: new Set() });
      try { if (element.hasPointerCapture(a.id)) element.releasePointerCapture(a.id); } catch { /* Older Safari / disconnected element. */ }
    };
    const abort = () => finish(false);
    interrupt.current = abort;
    const down = (event: PointerEvent) => {
      const p = props.current;
      if (!p.enabled || !p.ready || active.current || event.button !== 0 || !(event.pointerType === 'pen' || (p.tools.mouseDevelopmentMode && event.pointerType === 'mouse'))) return;
      const first = point(event); if (!first) return;
      event.preventDefault();
      // Finalize another surface before this contact exists, so its first stroke is never lost.
      finishInkGestures(); p.onActive();
      const highlight = p.tools.selectedTool === 'highlighter', eraser = p.tools.selectedTool === 'eraser';
      const stroke: InkStroke = { id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).slice(2), tool: highlight ? 'highlighter' : 'pen', color: highlight ? p.tools.highlighterColor : p.tools.penColor, width: highlight ? p.tools.highlighterWidth : p.tools.penWidth, points: [first] };
      active.current = { id: event.pointerId, gesture: eraser ? null : new HoldToStraight(stroke, screenPoint, schedule, event.pointerType === 'pen'), base: p.doc, erased: new Set(), eraser, last: first };
      if (active.current.eraser) for (const s of p.doc.strokes) if (hitsStroke(s, first, first)) active.current.erased.add(s.id);
      try { element.setPointerCapture(event.pointerId); } catch { /* Window listeners below also receive uncaptured moves. */ }
      schedule();
    };
    const move = (event: PointerEvent) => {
      const a = active.current; if (!a || event.pointerId !== a.id) return;
      if (event.cancelable) event.preventDefault();
      let events: PointerEvent[] = [];
      try { events = event.getCoalescedEvents?.() ?? []; } catch { /* Safe single-event fallback. */ }
      // Safari may omit the dispatched event from its coalesced list. Its final location wins.
      if (!events.length || events[events.length - 1].clientX !== event.clientX || events[events.length - 1].clientY !== event.clientY) events = [...events, event];
      for (const sample of events) {
        const p = point(sample); if (!p) continue;
        if (a.eraser) { for (const s of a.base.strokes) if (!a.erased.has(s.id) && hitsStroke(s, a.last, p)) a.erased.add(s.id); }
        else a.gesture?.append(p);
        a.last = p;
      }
      schedule();
    };
    const up = (event: PointerEvent) => { if (active.current?.id === event.pointerId) { move(event); finish(true); } };
    const cancel = (event: PointerEvent) => { if (active.current?.id === event.pointerId) abort(); };
    // touch-action stays auto so fingers can scroll. Safari's stylus TouchEvent
    // is cancelled locally to suppress Pencil panning; ink still uses Pointer Events.
    const stylusTouch = (event: TouchEvent) => {
      if (!props.current.enabled || !props.current.ready) return;
      const stylus = Array.from(event.changedTouches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
      if (stylus && event.cancelable) event.preventDefault();
    };
    const hide = () => { if (window.document.visibilityState !== 'visible') abort(); };
    const unregister = registerInkGesture(abort);
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    element.addEventListener('lostpointercapture', cancel);
    element.addEventListener('touchstart', stylusTouch, { passive: false }); element.addEventListener('touchmove', stylusTouch, { passive: false });
    window.document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', abort); window.addEventListener('blur', abort);
    return () => {
      unregister();
      abort(); interrupt.current = () => {}; if (frame) cancelAnimationFrame(frame);
      element.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); element.removeEventListener('lostpointercapture', cancel);
      element.removeEventListener('touchstart', stylusTouch); element.removeEventListener('touchmove', stylusTouch);
      window.document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', abort); window.removeEventListener('blur', abort);
    };
  }, []);
  return <svg ref={svg} className={`ink-canvas ${enabled ? 'ink-enabled' : ''}`} data-ink-surface={surface} data-ready={ready}
    aria-label={surface === 'scratchpad' ? '풀이 노트 필기 공간' : '지문 필기 레이어'} role="img" viewBox={`0 0 ${doc.width} ${height}`}
    style={{ aspectRatio: `${doc.width} / ${height}`, pointerEvents: enabled ? 'auto' : 'none' }}>
    {surface === 'scratchpad' && <><rect width="100%" height="100%" fill="white"/>{doc.background === 'grid' && <><defs><pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 H 0 V 24" fill="none" stroke="#dce5dc" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`}/></>}</>}
    <g style={{ mixBlendMode: 'multiply' }}>{doc.strokes.filter(s => !preview.erased.has(s.id)).map(s => <InkStrokePath key={s.id} stroke={s}/>)}{preview.stroke && <g data-ink-preview><InkStrokePath stroke={preview.stroke}/></g>}</g>
  </svg>;
}
