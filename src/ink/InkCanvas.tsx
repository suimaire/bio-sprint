import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { hitsStroke, pressureValue, strokePath } from './geometry';
import type { InkDocument, InkPoint, InkStroke, InkSurface, InkTools } from './model';
import { finishInkGestures, registerInkGesture } from './gestures';
import { HoldToStraight, type StrokeCommit } from './hold';
import { inputDebug } from '../inputDebug';

// Eraser contacts follow the visible stroke, even where a legacy stroke extends
// into a neighboring surface. History still belongs to that stroke's document.
const cardInputs = new Map<SVGSVGElement, { card: Element; host: Element; hit: (event: PointerEvent) => boolean; begin: (event: PointerEvent) => void }>();

export const InkStrokePath = memo(function InkStrokePath({ stroke }: { stroke: InkStroke }) {
  const highlight = stroke.tool === 'highlighter', tap = stroke.points.length === 1;
  return <path data-stroke={stroke.id} data-shape={stroke.shape ?? 'freehand'} d={strokePath(stroke)} fill={highlight && !tap ? 'none' : stroke.color}
    stroke={highlight && !tap ? stroke.color : 'none'} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={highlight ? .28 : 1}/>;
});
type Props = { document: InkDocument; surface: InkSurface; tools: InkTools; enabled: boolean; ready: boolean; height?: number; width?: number;
  onActive: () => void; onStroke: (commit: StrokeCommit, height: number) => void;
  onChange: (update: (document: InkDocument) => InkDocument) => void };
export function InkCanvas({ document: doc, surface, tools, enabled, ready, height = doc.height, width = doc.width, onChange, onStroke, onActive }: Props) {
  const svg = useRef<SVGSVGElement>(null), gridId = useId().replace(/:/g, '');
  const props = useRef({ doc, tools, enabled, ready, height, onChange, onStroke, onActive }); props.current = { doc, tools, enabled, ready, height, onChange, onStroke, onActive };
  const active = useRef<{ id: number; gesture: HoldToStraight | null; base: InkDocument; erased: Set<string>; eraser: boolean; last: InkPoint } | null>(null);
  const interrupt = useRef(() => {});
  useLayoutEffect(() => { interrupt.current(); }, [tools, enabled, ready]);
  const [preview, setPreview] = useState<{ stroke: InkStroke | null; erased: Set<string> }>({ stroke: null, erased: new Set() });
  const [diagnostic, setDiagnostic] = useState('HOLD_NOT_REACHED');
  useEffect(() => {
    const element = svg.current!;
    // SVG is visual only on question cards. Native HTML receives fingers/clicks;
    // the containing surface intercepts only Pencil contacts in capture phase.
    const host = element.closest<HTMLElement>('[data-ink-input]') ?? element;
    const card = element.closest<HTMLElement>('.ink-card-sheet');
    const owns = (target: EventTarget | null) => target instanceof Element &&
      !target.closest('[data-ink-exclude], input, textarea, select, [contenteditable]:not([contenteditable="false"])') &&
      (target.closest('[data-ink-input]') ?? element) === host;
    let lastPenClick: { x: number; y: number; time: number } | null = null;
    let frame = 0;
    const paint = () => { frame = 0; const a = active.current, s = a?.gesture?.preview; setPreview({ stroke: s ? { ...s, points: [...s.points] } : null, erased: new Set(a?.erased) }); if (inputDebug && a?.gesture) setDiagnostic(`${a.gesture.result} · ${a.gesture.geometry ?? 'WAITING'}`); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const point = (event: PointerEvent): InkPoint | null => {
      const matrix = element.getScreenCTM(); if (!matrix) return null;
      let p: DOMPoint;
      const bounds = card?.getBoundingClientRect();
      const x = bounds ? Math.max(bounds.left, Math.min(bounds.right, event.clientX)) : event.clientX;
      const y = bounds ? Math.max(bounds.top, Math.min(bounds.bottom, event.clientY)) : event.clientY;
      try { p = new DOMPoint(x, y).matrixTransform(matrix.inverse()); } catch { return null; }
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      // Legacy stem/statement coordinates stay local, including a stroke that
      // continues over the surrounding card. Never rescale old points by height.
      return { x: card ? p.x : Math.max(0, Math.min(props.current.doc.width, p.x)), y: card ? p.y : Math.max(0, Math.min(props.current.height, p.y)), pressure: event.type === 'pointerup' && !event.pressure ? active.current?.last.pressure ?? .5 : pressureValue(event.pressure) };
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
      try { if (host.hasPointerCapture(a.id)) host.releasePointerCapture(a.id); } catch { /* Older Safari / disconnected element. */ }
    };
    const abort = () => finish(false);
    interrupt.current = abort;
    const begin = (event: PointerEvent) => {
      const p = props.current;
      lastPenClick = null;
      if (!p.enabled || !p.ready || event.defaultPrevented || active.current || event.button !== 0 || !(event.pointerType === 'pen' || (p.tools.mouseDevelopmentMode && event.pointerType === 'mouse'))) return;
      const first = point(event); if (!first) return;
      event.preventDefault();
      // Finalize another surface before this contact exists, so its first stroke is never lost.
      finishInkGestures(); p.onActive();
      const highlight = p.tools.selectedTool === 'highlighter', eraser = p.tools.selectedTool === 'eraser';
      const stroke: InkStroke = { id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).slice(2), tool: highlight ? 'highlighter' : 'pen', color: highlight ? p.tools.highlighterColor : p.tools.penColor, width: highlight ? p.tools.highlighterWidth : p.tools.penWidth, points: [first] };
      active.current = { id: event.pointerId, gesture: eraser ? null : new HoldToStraight(stroke, screenPoint, schedule, event.pointerType === 'pen'), base: p.doc, erased: new Set(), eraser, last: first };
      if (active.current.eraser) for (const s of p.doc.strokes) if (hitsStroke(s, first, first)) active.current.erased.add(s.id);
      try { host.setPointerCapture(event.pointerId); } catch { /* Window listeners below also receive uncaptured moves. */ }
      schedule();
    };
    if (card) cardInputs.set(element, { card, host, begin, hit: event => {
      const p = point(event);
      return props.current.enabled && props.current.ready && !!p && props.current.doc.strokes.some(stroke => hitsStroke(stroke, p, p));
    } });
    const down = (event: PointerEvent) => {
      // The outer card sees the contact before its child surfaces. Find the
      // document containing the visible hit; nested listeners then see preventDefault.
      if (surface === 'card' && props.current.tools.selectedTool === 'eraser' && event.target instanceof Element &&
        !event.target.closest('[data-ink-exclude], input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
        const targetHost = event.target.closest('[data-ink-input]');
        const hits = [...cardInputs.values()].filter(input => input.card === card && input.hit(event));
        const owner = hits.find(input => input.host === targetHost) ?? hits[0];
        if (owner) { owner.begin(event); return; }
      }
      if (owns(event.target)) begin(event);
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
    const up = (event: PointerEvent) => { if (active.current?.id === event.pointerId) { if (event.pointerType === 'pen') lastPenClick = { x: event.clientX, y: event.clientY, time: performance.now() }; move(event); finish(true); } };
    const click = (event: MouseEvent) => {
      if (!props.current.enabled || !props.current.ready || !owns(event.target)) return;
      const pointerType = (event as PointerEvent).pointerType;
      if (pointerType === 'pen' || (!pointerType && event.detail > 0 && lastPenClick && performance.now() - lastPenClick.time < 700 && Math.hypot(event.clientX - lastPenClick.x, event.clientY - lastPenClick.y) < 12)) {
        event.preventDefault(); event.stopPropagation();
      }
      lastPenClick = null;
    };
    const cancel = (event: PointerEvent) => { if (active.current?.id === event.pointerId) abort(); };
    // touch-action stays auto so fingers can scroll. Safari's stylus TouchEvent
    // is cancelled locally to suppress Pencil panning; ink still uses Pointer Events.
    const stylusTouch = (event: TouchEvent) => {
      if (!props.current.enabled || !props.current.ready || !owns(event.target)) return;
      const stylus = Array.from(event.changedTouches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
      if (stylus && event.cancelable) event.preventDefault();
    };
    const hide = () => { if (window.document.visibilityState !== 'visible') abort(); };
    const unregister = registerInkGesture(abort);
    host.addEventListener('pointerdown', down as EventListener, true);
    host.addEventListener('click', click as EventListener, true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    host.addEventListener('lostpointercapture', cancel as EventListener);
    host.addEventListener('touchstart', stylusTouch as EventListener, { passive: false }); host.addEventListener('touchmove', stylusTouch as EventListener, { passive: false });
    window.document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', abort); window.addEventListener('blur', abort);
    return () => {
      unregister();
      cardInputs.delete(element);
      abort(); interrupt.current = () => {}; if (frame) cancelAnimationFrame(frame);
      host.removeEventListener('pointerdown', down as EventListener, true); host.removeEventListener('click', click as EventListener, true); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); host.removeEventListener('lostpointercapture', cancel as EventListener);
      host.removeEventListener('touchstart', stylusTouch as EventListener); host.removeEventListener('touchmove', stylusTouch as EventListener);
      window.document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', abort); window.removeEventListener('blur', abort);
    };
  }, []);
  return <svg ref={svg} className={`ink-canvas ${enabled ? 'ink-enabled' : ''}`} data-ink-surface={surface} data-ready={ready} data-ink-debug={inputDebug || undefined} data-hold-result={inputDebug ? diagnostic : undefined}
    aria-label={surface === 'scratchpad' ? '풀이 노트 필기 공간' : '지문 필기 레이어'} role="img" viewBox={`0 0 ${width} ${height}`}
    style={{ aspectRatio: `${width} / ${height}`, ...(surface !== 'scratchpad' ? { width, height } : {}), pointerEvents: surface === 'scratchpad' && enabled ? 'auto' : 'none' }}>
    {surface === 'scratchpad' && <><rect width="100%" height="100%" fill="white"/>{doc.background === 'grid' && <><defs><pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 H 0 V 24" fill="none" stroke="#dce5dc" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`}/></>}</>}
    <g style={{ mixBlendMode: 'multiply' }}>{doc.strokes.filter(s => !preview.erased.has(s.id)).map(s => <InkStrokePath key={s.id} stroke={s}/>)}{preview.stroke && <g data-ink-preview><InkStrokePath stroke={preview.stroke}/></g>}</g>
    {inputDebug && <text x="4" y="12" fontSize="9" fill="#923c25">{diagnostic}</text>}
  </svg>;
}
