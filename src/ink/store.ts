import { emptyDocument, keyId, type InkDocument, type InkKey, type InkStroke } from './model';
import { InkConflict, readInk, saveInk } from './storage';
import { finishInkGestures } from './gestures';

export interface InkState {
  document: InkDocument; revision: number; loaded: boolean;
  status: 'loading' | 'saved' | 'saving' | 'error' | 'conflict'; error: string;
  canUndo: boolean; canRedo: boolean;
}
const entries = new Map<string, InkStore>();
const cancelledSessions = new Set<string>();
const globalListeners = new Set<() => void>();
let globalRevision = 0;
const notifyGlobal = () => { globalRevision++; globalListeners.forEach(f => f()); };
export const subscribeInk = (f: () => void) => { globalListeners.add(f); return () => { globalListeners.delete(f); }; };
export const inkRevision = () => globalRevision;
export const inkStores = () => [...entries.values()];

// Stores outlive React views: an unsuccessful save remains available after moving
// questions, closing a note, finishing a set, or navigating away from the report.
export class InkStore {
  private state: InkState;
  private saved: InkDocument;
  private undoStack: InkDocument[] = [];
  private redoStack: InkDocument[] = [];
  private listeners = new Set<() => void>();
  private saving = false;
  private saveTask?: Promise<void>;
  private disposed = false;
  private loading?: Promise<void>;
  constructor(readonly key: InkKey) {
    this.saved = emptyDocument(key.surface);
    this.state = { document: this.saved, revision: 0, loaded: false, status: 'loading', error: '', canUndo: false, canRedo: false };
    this.disposed = cancelledSessions.has(key.sessionId);
  }
  snapshot = () => this.state;
  subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  private publish(patch: Partial<InkState>) {
    this.state = { ...this.state, ...patch, canUndo: !!this.undoStack.length, canRedo: !!this.redoStack.length };
    this.listeners.forEach(f => f()); notifyGlobal();
  }
  load = (): Promise<void> => {
    if (this.disposed) return Promise.resolve();
    if (this.loading) return this.loading;
    if (this.state.loaded) return Promise.resolve();
    this.publish({ status: 'loading', error: '' });
    this.loading = readInk(this.key).then(record => {
      if (this.disposed) return;
      this.saved = record?.document ?? emptyDocument(this.key.surface);
      this.publish({ document: this.saved, revision: record?.revision ?? 0, loaded: true, status: 'saved' });
    }).catch(error => { if (!this.disposed) this.publish({ status: 'error', error: String(error instanceof Error ? error.message : error) }); })
      .finally(() => { this.loading = undefined; });
    return this.loading;
  };
  change(update: (current: InkDocument) => InkDocument) {
    if (this.disposed) return;
    finishInkGestures();
    const document = update(this.state.document);
    if (!this.state.loaded || document === this.state.document) return;
    this.undoStack.push(this.state.document);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    this.publish({ document }); void this.flush();
  }
  commitStroke(stroke: InkStroke, original?: InkStroke, height?: number) {
    if (this.disposed) return;
    finishInkGestures();
    if (!this.state.loaded) return;
    const current = this.state.document;
    const append = (s: InkStroke): InkDocument => ({ ...current, height: height ?? current.height, strokes: [...current.strokes, s] });
    this.undoStack.push(current);
    // Keep the freehand state in history only. Publish and persist the final state once.
    if (original) this.undoStack.push(append(original));
    this.undoStack = this.undoStack.slice(-80); this.redoStack = [];
    this.publish({ document: append(stroke) }); void this.flush();
  }
  undo = () => {
    if (this.disposed) return;
    finishInkGestures();
    const document = this.undoStack.pop(); if (!document) return;
    this.redoStack.push(this.state.document); this.publish({ document }); void this.flush();
  };
  redo = () => {
    if (this.disposed) return;
    finishInkGestures();
    const document = this.redoStack.pop(); if (!document) return;
    this.undoStack.push(this.state.document); this.publish({ document }); void this.flush();
  };
  dirty = () => !this.disposed && this.state.loaded && this.state.document !== this.saved;
  flush = (): Promise<void> => {
    if (this.saveTask) return this.saveTask;
    this.saveTask = this.persist().finally(() => { this.saveTask = undefined; });
    return this.saveTask;
  };
  private persist = async () => {
    if (this.saving || !this.dirty() || this.state.status === 'error' || this.state.status === 'conflict') return;
    this.saving = true; this.publish({ status: 'saving', error: '' });
    try {
      while (this.dirty()) {
        const document = this.state.document;
        const record = await saveInk(this.key, document, this.state.revision);
        if (this.disposed) return;
        this.saved = document; this.publish({ revision: record.revision });
      }
      this.publish({ status: 'saved' });
    } catch (error) {
      if (this.disposed) return;
      this.publish({ status: error instanceof InkConflict ? 'conflict' : 'error', error: error instanceof Error ? error.message : String(error) });
    } finally { this.saving = false; }
  };
  retry = async () => {
    if (this.disposed) return;
    if (!this.state.loaded) return this.load();
    if (this.state.status === 'conflict') return; // Never rebase and silently overwrite another tab.
    this.publish({ status: 'saved', error: '' }); await this.flush();
  };
  // Caller must have exported the recovery buffer and confirmed discarding it.
  reload = async () => {
    if (this.saving || this.disposed) return;
    this.undoStack = []; this.redoStack = [];
    this.publish({ loaded: false }); await this.load();
  };
  discard = async () => {
    this.disposed = true;
    this.undoStack = []; this.redoStack = [];
    this.saved = emptyDocument(this.key.surface);
    this.publish({ document: this.saved, revision: 0, loaded: true, status: 'saved', error: '' });
    await Promise.allSettled([this.saveTask, this.loading]);
  };
}
export function getInkStore(key: InkKey) {
  const id = keyId(key);
  let store = entries.get(id);
  if (!store) { store = new InkStore(key); if (!cancelledSessions.has(key.sessionId)) entries.set(id, store); }
  return store;
}
export function flushInk() { for (const store of entries.values()) void store.flush(); }
export async function flushSessionInk(sessionId: string) {
  finishInkGestures();
  const stores = inkStores().filter(s => s.key.sessionId === sessionId);
  await Promise.all(stores.map(s => s.flush()));
  if (stores.some(s => s.dirty() || ['error', 'conflict'].includes(s.snapshot().status))) throw new Error('필기를 저장하지 못했습니다. 아래 필기 복구 안내에서 저장 문제를 해결한 뒤 다시 시도해 주세요.');
}
export async function discardSessionInk(sessionId: string) {
  cancelledSessions.add(sessionId);
  if (!inkStores().some(store => store.key.sessionId === sessionId)) return;
  finishInkGestures();
  const pending: Promise<void>[] = [];
  for (const [id, store] of entries) if (store.key.sessionId === sessionId) { pending.push(store.discard()); entries.delete(id); }
  notifyGlobal();
  await Promise.all(pending);
}
