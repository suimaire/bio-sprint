import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { QFPrompt } from '../QFPrompt';
import type { QFQuestion } from '../qfModel';
import { ANNOTATION_WIDTH, defaultTools, inkKey, surfaceLabels, type InkScope, type InkSurface } from './model';
import { getInkStore, type InkStore } from './store';
import { InkCanvas } from './InkCanvas';
import { SharedInkToolbar } from './InkToolbar';
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
function Annotation({ store, enabled, selected, tools, children, onActive }: { store: InkStore; enabled: boolean; selected: boolean; tools: typeof defaultTools; children: ReactNode; onActive: () => void }) {
  const state = useInk(store), content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(160);
  useLayoutEffect(() => {
    const el = content.current!;
    const measure = () => setHeight(Math.max(1, el.offsetHeight));
    measure(); const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div className="ink-annotation-scroll" aria-label={surfaceLabels[store.key.surface] + ' · 좁은 화면에서 가로 스크롤'}>
    <div className={`ink-annotation-sheet ${enabled ? 'ink-annotation-active' : ''}`} data-active-ink={enabled && selected} style={{ width: ANNOTATION_WIDTH }}>
      <div className="ink-annotation-text" ref={content}>{children}</div>
      <InkCanvas document={state.document} surface={store.key.surface} height={height} tools={tools} enabled={enabled} ready={state.loaded} onActive={onActive} onStroke={({ stroke, original }, height) => store.commitStroke(stroke, original, height)} onChange={doc => store.change(doc)}/>
    </div>
  </div>;
}
export function QFInk({ scope, q, readOnly = false, children }: { scope: InkScope; q: QFQuestion; readOnly?: boolean; children?: ReactNode }) {
  const [annotation, setAnnotation] = useState(false), [noteOpen, setNoteOpen] = useState(false), [expanded, setExpanded] = useState(false);
  const [tools, setTools] = useState(defaultTools);
  const [activeSurface, setActiveSurface] = useState<InkSurface>('stem'), [exportError, setExportError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = root.current?.closest('.qf-player')?.querySelector('.exam-toolbar');
    if (!header) return;
    const measure = () => root.current?.style.setProperty('--ink-sticky-top', `${header.getBoundingClientRect().height + 12}px`);
    measure(); const observer = new ResizeObserver(measure); observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const stemStore = getInkStore(inkKey(scope, 'stem')), statementStore = getInkStore(inkKey(scope, 'statement')), noteStore = getInkStore(inkKey(scope, 'scratchpad'));
  const activeStore = activeSurface === 'scratchpad' ? noteStore : activeSurface === 'statement' ? statementStore : stemStore;
  const activeState = useInk(activeStore), noteState = useInk(noteStore);
  const updateTools = (next: typeof tools) => { finishInkGestures(); setTools(next); };
  const toggleAnnotation = () => {
    finishInkGestures();
    if (!annotation && !noteOpen) setActiveSurface('stem');
    if (annotation && activeSurface !== 'scratchpad' && noteOpen) setActiveSurface('scratchpad');
    setAnnotation(v => !v);
  };
  const toggleNote = () => {
    finishInkGestures();
    if (!noteOpen && !annotation) setActiveSurface('scratchpad');
    if (noteOpen && activeSurface === 'scratchpad') setActiveSurface('stem');
    setNoteOpen(v => !v); setExpanded(false);
  };
  async function exporting(action: () => Promise<void>) { try { finishInkGestures(); await action(); setExportError(''); } catch (e) { setExportError(e instanceof Error ? e.message : String(e)); } }
  return <div ref={root} className={`qf-ink ${noteOpen ? 'qf-ink-with-note' : ''} ${expanded ? 'qf-ink-expanded' : ''}`}>
    <div className="ink-actions button-row">
      <button className="button secondary" aria-expanded={annotation} onClick={toggleAnnotation}>{readOnly ? '지문 필기 열람' : '지문 필기'}</button>
      <button className="button secondary" aria-expanded={noteOpen} onClick={toggleNote}>풀이 노트</button>
      <button className="button secondary" onClick={() => void exporting(() => exportQuestion(scope))}>문항 필기 JSON 내보내기</button>
      {readOnly && <span className="small muted">필기 읽기 전용</span>}
    </div>
    <p className="small muted ink-local-notice">필기는 이 기기의 브라우저에만 저장되며 서버와 자동 동기화되지 않습니다. Safari 사이트 데이터를 지우면 사라질 수 있으므로 JSON/PNG로 내보내세요. Study Data 백업에는 필기가 포함되지 않습니다.</p>
    {exportError && <p role="alert" className="alert">{exportError}</p>}
    <div className={`ink-body ${!readOnly ? 'ink-body-editable' : ''}`}>
    {!readOnly && <div className="ink-toolbar-rail">{(annotation || noteOpen) && <SharedInkToolbar tools={tools} setTools={updateTools} store={activeStore} state={activeState}/>}</div>}
    <div className="ink-workspace-grid"><div className="ink-question-content">
      <QFPrompt q={q} wrapInk={(surface, content) => <Annotation store={surface === 'stem' ? stemStore : statementStore} enabled={annotation && !readOnly} selected={activeSurface === surface} tools={tools} onActive={() => setActiveSurface(surface)}>{content}</Annotation>}/>
      {children}
      {annotation && <div className="ink-annotation-status"><p className="small muted">Apple Pencil로 필기 · 손가락으로 스크롤 · 좁은 지문은 가로 스크롤</p><InkStatus store={stemStore}/>{q.format === 'COMBINATION' && <InkStatus store={statementStore}/>}</div>}
    </div>
    {noteOpen && <aside className="ink-note" data-active-ink={!readOnly && activeSurface === 'scratchpad'} aria-label="문항별 풀이 노트">
      <div className="ink-actions button-row"><h3>풀이 노트</h3><button className="button secondary" aria-expanded={expanded} onClick={() => { finishInkGestures(); setExpanded(v => !v); }}>{expanded ? '나란히 보기' : '넓게 보기'}</button><button className="button secondary" onClick={toggleNote}>노트 닫기</button></div>
      <InkStatus store={noteStore}/>
      <div className="ink-actions button-row">{!readOnly && <><label>노트 배경<select aria-label="노트 배경" disabled={!noteState.loaded} value={noteState.document.background} onChange={e => { const background = e.target.value as 'plain' | 'grid'; noteStore.change(current => ({ ...current, background })); }}><option value="plain">무지</option><option value="grid">모눈</option></select></label><button className="button secondary" disabled={!noteState.loaded || noteState.document.height >= 15360} onClick={() => noteStore.change(current => ({ ...current, height: current.height + 480 }))}>아래로 확장</button></>}
        <button className="button secondary" disabled={!noteState.loaded} onClick={() => void exporting(() => exportNotePNG(scope, noteStore.snapshot().document))}>노트 PNG 내보내기</button></div>
      <div className="ink-note-scroll"><InkCanvas document={noteState.document} surface="scratchpad" tools={tools} enabled={!readOnly} ready={noteState.loaded} onActive={() => setActiveSurface('scratchpad')} onStroke={({ stroke, original }) => noteStore.commitStroke(stroke, original)} onChange={doc => noteStore.change(doc)}/></div>
    </aside>}
    </div>
    </div>
  </div>;
}
