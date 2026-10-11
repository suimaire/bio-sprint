import { memo, useEffect, useId, useRef, useState } from 'react';
import { hitsStroke, pressureValue, strokePath } from './geometry';
import type { InkDocument, InkPoint, InkStroke, InkSurface, InkTools } from './model';
import { registerInkGesture } from './gestures';

export const InkStrokePath = memo(function InkStrokePath({ stroke }: { stroke: InkStroke }) {
  const highlight = stroke.tool === 'highlighter', tap = stroke.points.length === 1;
  return <path data-stroke={stroke.id} d={strokePath(stroke)} fill={highlight && !tap ? 'none' : stroke.color}
    stroke={highlight && !tap ? stroke.color : 'none'} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={highlight ? .28 : 1}/>;
});
type Props = { document: InkDocument; surface: InkSurface; tools: InkTools; enabled: boolean; ready: boolean; height?: number; onChange: (update: (document: InkDocument) => InkDocument) => void };
export function InkCanvas({ document: doc, surface, tools, enabled, ready, height = doc.height, onChange }: Props) {
  const svg = useRef<SVGSVGElement>(null), gridId = useId().replace(/:/g, '');
  const props = useRef({ doc, tools, enabled, ready, height, onChange }); props.current = { doc, tools, enabled, ready, height, onChange };
  const active = useRef<{ id: number; stroke: InkStroke; base: InkDocument; erased: Set<string>; eraser: boolean; last: InkPoint } | null>(null);
  const [preview, setPreview] = useState<{ stroke: InkStroke | null; erased: Set<string> }>({ stroke: null, erased: new Set() });
  useEffect(() => {
    const element = svg.current!;
    let frame = 0;
    const paint = () => { frame = 0; const a = active.current; setPreview({ stroke: a && !a.eraser ? { ...a.stroke, points: [...a.stroke.points] } : null, erased: new Set(a?.erased) }); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const point = (event: PointerEvent): InkPoint | null => {
      const matrix = element.getScreenCTM(); if (!matrix) return null;
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return { x: Math.max(0, Math.min(props.current.doc.width, p.x)), y: Math.max(0, Math.min(props.current.height, p.y)), pressure: pressureValue(event.pressure) };
    };
    const finish = () => {
      const a = active.current; if (!a) return;
      active.current = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      if (!a.eraser || a.erased.size) props.current.onChange(current => ({ ...current, height: surface === 'scratchpad' ? current.height : props.current.height, strokes: a.eraser ? current.strokes.filter(s => !a.erased.has(s.id)) : [...current.strokes, a.stroke] }));
      setPreview({ stroke: null, erased: new Set() });
      try { if (element.hasPointerCapture(a.id)) element.releasePointerCapture(a.id); } catch { /* Older Safari / disconnected element. */ }
    };
    const down = (event: PointerEvent) => {
      const p = props.current;
      if (!p.enabled || !p.ready || active.current || event.button !== 0 || !(event.pointerType === 'pen' || (p.tools.mouse && event.pointerType === 'mouse'))) return;
      const first = point(event); if (!first) return;
      event.preventDefault();
      const stroke: InkStroke = { id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).slice(2), tool: p.tools.tool === 'highlighter' ? 'highlighter' : 'pen', color: p.tools.tool === 'highlighter' ? '#f5c542' : p.tools.color, width: p.tools.tool === 'highlighter' ? [12, 20, 30][p.tools.size - 1] : [2, 3.5, 6][p.tools.size - 1], points: [first] };
      active.current = { id: event.pointerId, stroke, base: p.doc, erased: new Set(), eraser: p.tools.tool === 'eraser', last: first };
      if (active.current.eraser) for (const s of p.doc.strokes) if (hitsStroke(s, first, first)) active.current.erased.add(s.id);
      try { element.setPointerCapture(event.pointerId); } catch { /* Window listeners below also receive uncaptured moves. */ }
      schedule();
    };
    const move = (event: PointerEvent) => {
      const a = active.current; if (!a || event.pointerId !== a.id) return;
      if (event.cancelable) event.preventDefault();
      let events: PointerEvent[] = [];
      try { events = event.getCoalescedEvents?.() ?? []; } catch { /* Safe single-event fallback. */ }
      if (!events.length) events = [event];
      for (const sample of events) {
        const p = point(sample); if (!p) continue;
        if (a.eraser) { for (const s of a.base.strokes) if (!a.erased.has(s.id) && hitsStroke(s, a.last, p)) a.erased.add(s.id); }
        else if (Math.hypot(p.x - a.last.x, p.y - a.last.y) >= .3) a.stroke.points.push(p);
        a.last = p;
      }
      schedule();
    };
    const up = (event: PointerEvent) => { if (active.current?.id === event.pointerId) { move(event); finish(); } };
    const cancel = (event: PointerEvent) => { if (active.current?.id === event.pointerId) finish(); };
    // touch-action stays auto so fingers can scroll. Safari's stylus TouchEvent
    // is cancelled locally to suppress Pencil panning; ink still uses Pointer Events.
    const stylusTouch = (event: TouchEvent) => {
      if (!props.current.enabled || !props.current.ready) return;
      const stylus = Array.from(event.changedTouches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
      if (stylus && event.cancelable) event.preventDefault();
    };
    const hide = () => { if (window.document.visibilityState !== 'visible') finish(); };
    const unregister = registerInkGesture(finish);
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    element.addEventListener('lostpointercapture', cancel);
    element.addEventListener('touchstart', stylusTouch, { passive: false }); element.addEventListener('touchmove', stylusTouch, { passive: false });
    window.document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', finish); window.addEventListener('blur', finish);
    return () => {
      unregister();
      finish(); if (frame) cancelAnimationFrame(frame);
      element.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); element.removeEventListener('lostpointercapture', cancel);
      element.removeEventListener('touchstart', stylusTouch); element.removeEventListener('touchmove', stylusTouch);
      window.document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', finish); window.removeEventListener('blur', finish);
    };
  }, []);
  return <svg ref={svg} className={`ink-canvas ${enabled ? 'ink-enabled' : ''}`} data-ink-surface={surface} data-ready={ready}
    aria-label={surface === 'scratchpad' ? '풀이 노트 필기 공간' : '지문 필기 레이어'} role="img" viewBox={`0 0 ${doc.width} ${height}`}
    style={{ aspectRatio: `${doc.width} / ${height}`, pointerEvents: enabled ? 'auto' : 'none' }}>
    {surface === 'scratchpad' && <><rect width="100%" height="100%" fill="white"/>{doc.background === 'grid' && <><defs><pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 H 0 V 24" fill="none" stroke="#dce5dc" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`}/></>}</>}
    <g style={{ mixBlendMode: 'multiply' }}>{doc.strokes.filter(s => !preview.erased.has(s.id)).map(s => <InkStrokePath key={s.id} stroke={s}/>)}{preview.stroke && <InkStrokePath stroke={preview.stroke}/>}</g>
  </svg>;
}
