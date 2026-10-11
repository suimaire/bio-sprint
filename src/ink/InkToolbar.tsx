import { useEffect, useRef, useState } from 'react';
import { inkColors, type InkTools } from './model';
import type { InkState, InkStore } from './store';
import { finishInkGestures } from './gestures';

type IconName = InkTools['selectedTool'] | 'undo' | 'redo' | 'settings';
function InkIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    pen: 'm15 4 5 5 M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z M4 14l5 5',
    highlighter: 'm14 3 7 7-9 9-7-7z M7 14l-4 5 2 2 5-4 M3 22h10',
    eraser: 'm14 3 7 7-11 11H6l-4-4z M8 11l7 7 M10 21h11',
    undo: 'M9 5 4 10l5 5 M4 10h10a6 6 0 0 1 0 12',
    redo: 'm15 5 5 5-5 5 M20 10H10a6 6 0 0 0 0 12',
    settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export function SharedInkToolbar({ tools, setTools, store, state }: { tools: InkTools; setTools: (tools: InkTools) => void; store: InkStore; state: InkState }) {
  const root = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<'colors' | 'settings' | null>(null), [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { setConfirmClear(false); }, [store]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setPanel(null); setConfirmClear(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPanel(null); setConfirmClear(false); } };
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, []);
  const highlight = tools.selectedTool === 'highlighter', eraser = tools.selectedTool === 'eraser';
  const color = highlight ? tools.highlighterColor : tools.penColor;
  const colors = inkColors[highlight ? 'highlighter' : 'pen'];
  const width = highlight ? tools.highlighterWidth : tools.penWidth;
  return <div ref={root} className="ink-toolbar" role="toolbar" aria-label="공통 필기 도구" aria-orientation="vertical" onPointerDownCapture={() => finishInkGestures()}>
    <span className="ink-active-label" data-active-surface={store.key.surface} aria-label="현재 필기 영역" aria-live="polite">{{ stem: '본문', statement: '진술', scratchpad: '노트' }[store.key.surface]}</span>
    {([['pen', '펜'], ['highlighter', '형광펜'], ['eraser', '지우개']] as const).map(([tool, name]) => <button key={tool} type="button" className="ink-tool-button" aria-label={name} title={name} aria-pressed={tools.selectedTool === tool} onClick={() => {
      if (tools.selectedTool === tool && tool !== 'eraser') setPanel(panel === 'colors' ? null : 'colors');
      else { setTools({ ...tools, selectedTool: tool }); setPanel(null); }
      setConfirmClear(false);
    }}><InkIcon name={tool}/></button>)}
    <div className="ink-tool-divider"/>
    <button type="button" className="ink-tool-button" aria-label="색상 및 굵기" title="색상 및 굵기" disabled={eraser} aria-expanded={panel === 'colors'} onClick={() => { setPanel(panel === 'colors' ? null : 'colors'); setConfirmClear(false); }}><span className="ink-color-dot" style={{ background: color }}/></button>
    <div className="ink-tool-divider"/>
    <button type="button" className="ink-tool-button" aria-label="실행 취소" title="실행 취소" disabled={!state.canUndo} onClick={store.undo}><InkIcon name="undo"/></button>
    <button type="button" className="ink-tool-button" aria-label="다시 실행" title="다시 실행" disabled={!state.canRedo} onClick={store.redo}><InkIcon name="redo"/></button>
    <button type="button" className="ink-tool-button" aria-label="필기 설정" title="필기 설정" aria-expanded={panel === 'settings'} onClick={() => { setPanel(panel === 'settings' ? null : 'settings'); setConfirmClear(false); }}><InkIcon name="settings"/></button>
    {panel === 'colors' && !eraser && <div className="ink-palette" role="dialog" aria-label={(highlight ? '형광펜' : '펜') + ' 색상 및 굵기'}>
      <strong>{highlight ? '형광펜' : '펜'}</strong>
      <div className="ink-swatches">{colors.map(([value, name]) => <button key={value} type="button" className="ink-swatch" aria-label={name} title={name} aria-pressed={color.toUpperCase() === value.toUpperCase()} onClick={() => setTools({ ...tools, ...(highlight ? { highlighterColor: value } : { penColor: value }) })}><span style={{ background: value }}/></button>)}</div>
      <label>굵기<select aria-label="필기 굵기" value={width} onChange={e => setTools({ ...tools, ...(highlight ? { highlighterWidth: Number(e.target.value) } : { penWidth: Number(e.target.value) }) })}>{(highlight ? [12, 20, 30] : [2, 3.5, 6]).map((value, i) => <option key={value} value={value}>{['가는 선', '중간 선', '굵은 선'][i]}</option>)}</select></label>
    </div>}
    {panel === 'settings' && <div className="ink-palette ink-settings" role="dialog" aria-label="필기 설정">
      <label className="ink-mouse"><input type="checkbox" checked={tools.mouseDevelopmentMode} onChange={e => setTools({ ...tools, mouseDevelopmentMode: e.target.checked })}/>마우스 필기 (개발용)</label>
      <button className="button secondary" disabled={!state.document.strokes.length} onClick={() => setConfirmClear(true)}>전체 지우기</button>
      {confirmClear && <div className="ink-clear" role="group" aria-label="필기 지우기 확인"><p>현재 {{ stem: '본문', statement: '진술', scratchpad: '노트' }[store.key.surface]} 필기를 지울까요?</p><button className="button danger" onClick={() => { store.change(current => ({ ...current, strokes: [] })); setConfirmClear(false); }}>이 영역 지우기</button><button className="button secondary" onClick={() => setConfirmClear(false)}>취소</button></div>}
    </div>}
  </div>;
}
