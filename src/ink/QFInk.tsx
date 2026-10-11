import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { QFPrompt } from '../QFPrompt';
import type { QFQuestion } from '../qfModel';
import { ANNOTATION_WIDTH, defaultTools, inkKey, surfaceLabels, type InkScope, type InkSurface } from './model';
import { getInkStore, type InkStore } from './store';
import { InkCanvas } from './InkCanvas';
import { InkToolbar } from './InkToolbar';
import { exportNotePNG, exportQuestion } from './export';
import { finishInkGestures } from './gestures';

export function useInk(store: InkStore) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => { void store.load(); return () => { void store.flush(); }; }, [store]);
  return state;
}
function InkStatus({ store }: { store: InkStore }) {
  const state = useInk(store);
  const labels = { loading: '필기 불러오는 중…', saving: '필기 저장 중…', saved: '필기 저장됨', error: state.loaded ? '필기 저장 실패' : '필기 불러오기 실패', conflict: '필기 저장 실패 · 다른 탭과 충돌' };
  return <p className={`small ink-status ${state.error ? 'ink-status-error' : 'muted'}`} data-ink-status={store.key.surface} aria-live="polite">{surfaceLabels[store.key.surface]} · {labels[state.status]}</p>;
}
function Annotation({ store, enabled, tools, children, onActive }: { store: InkStore; enabled: boolean; tools: typeof defaultTools; children: ReactNode; onActive: () => void }) {
  const state = useInk(store), content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(160);
  useLayoutEffect(() => {
    const el = content.current!;
    const measure = () => setHeight(Math.max(1, el.offsetHeight));
    measure(); const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div className="ink-annotation-scroll" aria-label={surfaceLabels[store.key.surface] + ' · 좁은 화면에서 가로 스크롤'}>
    <div className={`ink-annotation-sheet ${enabled ? 'ink-annotation-active' : ''}`} style={{ width: ANNOTATION_WIDTH }} onPointerDownCapture={event => { if (event.pointerType === 'pen' || (tools.mouse && event.pointerType === 'mouse')) onActive(); }}>
      <div className="ink-annotation-text" ref={content}>{children}</div>
      <InkCanvas document={state.document} surface={store.key.surface} height={height} tools={tools} enabled={enabled} ready={state.loaded} onChange={doc => store.change(doc)}/>
    </div>
  </div>;
}
export function QFInk({ scope, q, readOnly = false, children }: { scope: InkScope; q: QFQuestion; readOnly?: boolean; children?: ReactNode }) {
  const [annotation, setAnnotation] = useState(false), [noteOpen, setNoteOpen] = useState(false), [expanded, setExpanded] = useState(false);
  const [tools, setTools] = useState(defaultTools), [noteTools, setNoteTools] = useState(defaultTools);
  const [activeSurface, setActiveSurface] = useState<InkSurface>('stem'), [exportError, setExportError] = useState('');
  const stemStore = getInkStore(inkKey(scope, 'stem')), statementStore = getInkStore(inkKey(scope, 'statement')), noteStore = getInkStore(inkKey(scope, 'scratchpad'));
  const activeStore = activeSurface === 'statement' ? statementStore : stemStore;
  const activeState = useInk(activeStore), noteState = useInk(noteStore);
  async function exporting(action: () => Promise<void>) { try { finishInkGestures(); await action(); setExportError(''); } catch (e) { setExportError(e instanceof Error ? e.message : String(e)); } }
  return <div className={`qf-ink ${noteOpen ? 'qf-ink-with-note' : ''} ${expanded ? 'qf-ink-expanded' : ''}`}>
    <div className="ink-actions button-row">
      <button className="button secondary" aria-expanded={annotation} onClick={() => setAnnotation(v => !v)}>{readOnly ? '지문 필기 열람' : '지문 필기'}</button>
      <button className="button secondary" aria-expanded={noteOpen} onClick={() => { setNoteOpen(v => !v); setExpanded(false); }}>풀이 노트</button>
      <button className="button secondary" onClick={() => void exporting(() => exportQuestion(scope))}>문항 필기 JSON 내보내기</button>
      {readOnly && <span className="small muted">필기 읽기 전용</span>}
    </div>
    <p className="small muted ink-local-notice">필기는 이 기기의 브라우저에만 저장되며 서버와 자동 동기화되지 않습니다. Safari 사이트 데이터를 지우면 사라질 수 있으므로 JSON/PNG로 내보내세요. Study Data 백업에는 필기가 포함되지 않습니다.</p>
    {annotation && <div className="ink-annotation-controls">
      <p className="small muted">지문은 필기 위치 보존을 위해 고정 폭입니다. 좁은 화면에서는 지문을 가로로 스크롤하세요.{!readOnly && ' Apple Pencil로 필기하고 손가락으로 스크롤합니다.'}</p>
      {!readOnly && <><div className="ink-actions button-row"><button className="button secondary" aria-pressed={activeSurface === 'stem'} onClick={() => setActiveSurface('stem')}>본문 도구</button>{q.format === 'COMBINATION' && <button className="button secondary" aria-pressed={activeSurface === 'statement'} onClick={() => setActiveSurface('statement')}>진술 도구</button>}<button className="button secondary" onClick={() => setAnnotation(false)}>지문 필기 닫기</button></div>
        <InkToolbar key={activeSurface} label="지문 필기 도구" tools={tools} setTools={setTools} store={activeStore} state={activeState}/></>}
      <InkStatus store={stemStore}/>{q.format === 'COMBINATION' && <InkStatus store={statementStore}/>}
    </div>}
    {exportError && <p role="alert" className="alert">{exportError}</p>}
    <div className="ink-workspace-grid"><div className="ink-question-content">
      <QFPrompt q={q} wrapInk={(surface, content) => <Annotation store={surface === 'stem' ? stemStore : statementStore} enabled={annotation && !readOnly} tools={tools} onActive={() => setActiveSurface(surface)}>{content}</Annotation>}/>
      {children}
    </div>
    {noteOpen && <aside className="ink-note" aria-label="문항별 풀이 노트">
      <div className="ink-actions button-row"><h3>풀이 노트</h3><button className="button secondary" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '나란히 보기' : '넓게 보기'}</button><button className="button secondary" onClick={() => { setNoteOpen(false); setExpanded(false); }}>노트 닫기</button></div>
      <InkStatus store={noteStore}/>
      {!readOnly && <InkToolbar label="풀이 노트 도구" tools={noteTools} setTools={setNoteTools} store={noteStore} state={noteState}/>}
      <div className="ink-actions button-row">{!readOnly && <><label>노트 배경<select aria-label="노트 배경" disabled={!noteState.loaded} value={noteState.document.background} onChange={e => { const background = e.target.value as 'plain' | 'grid'; noteStore.change(current => ({ ...current, background })); }}><option value="plain">무지</option><option value="grid">모눈</option></select></label><button className="button secondary" disabled={!noteState.loaded || noteState.document.height >= 15360} onClick={() => noteStore.change(current => ({ ...current, height: current.height + 480 }))}>아래로 확장</button></>}
        <button className="button secondary" disabled={!noteState.loaded} onClick={() => void exporting(() => exportNotePNG(scope, noteStore.snapshot().document))}>노트 PNG 내보내기</button></div>
      <div className="ink-note-scroll"><InkCanvas document={noteState.document} surface="scratchpad" tools={noteTools} enabled={!readOnly} ready={noteState.loaded} onChange={doc => noteStore.change(doc)}/></div>
    </aside>}
    </div>
  </div>;
}
