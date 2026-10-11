import { useState } from 'react';
import type { InkTools } from './model';
import type { InkState, InkStore } from './store';

export function InkToolbar({ label, tools, setTools, store, state }: { label: string; tools: InkTools; setTools: (tools: InkTools) => void; store: InkStore; state: InkState }) {
  const [confirmClear, setConfirmClear] = useState(false);
  return <div className="ink-tools" role="group" aria-label={label}>
    {([['pen', '펜'], ['highlighter', '형광펜'], ['eraser', '지우개']] as const).map(([tool, name]) => <button key={tool} className="button secondary" aria-pressed={tools.tool === tool} onClick={() => setTools({ ...tools, tool })}>{name}</button>)}
    {([['#202923', '검정'], ['#245fbd', '파랑'], ['#c43e36', '빨강']] as const).map(([color, name]) => <button key={color} className="button secondary ink-color" aria-label={name} aria-pressed={tools.color === color} style={{ color }} onClick={() => setTools({ ...tools, color, tool: 'pen' })}>{name}</button>)}
    <label>굵기<select aria-label={label + ' 굵기'} value={tools.size} onChange={e => setTools({ ...tools, size: Number(e.target.value) as 1 | 2 | 3 })}><option value="1">가는 선</option><option value="2">중간 선</option><option value="3">굵은 선</option></select></label>
    <button className="button secondary" disabled={!state.canUndo} onClick={store.undo}>실행 취소</button>
    <button className="button secondary" disabled={!state.canRedo} onClick={store.redo}>다시 실행</button>
    <button className="button secondary" disabled={!state.document.strokes.length} onClick={() => setConfirmClear(true)}>전체 지우기</button>
    <label className="ink-mouse"><input type="checkbox" checked={tools.mouse} onChange={e => setTools({ ...tools, mouse: e.target.checked })}/>마우스 필기 (개발용)</label>
    {confirmClear && <div className="ink-clear" role="group" aria-label="필기 지우기 확인"><p>현재 문항의 선택한 필기 영역만 지울까요?</p><button className="button danger" onClick={() => { store.change(current => ({ ...current, strokes: [] })); setConfirmClear(false); }}>이 영역 지우기</button><button className="button secondary" onClick={() => setConfirmClear(false)}>취소</button></div>}
  </div>;
}
