import { emptyDocument, keyId, type InkDocument, type InkKey } from './model';
import { InkConflict, readInk, saveInk } from './storage';
import { finishInkGestures } from './gestures';

export interface InkState {
  document: InkDocument; revision: number; loaded: boolean;
  status: 'loading' | 'saved' | 'saving' | 'error' | 'conflict'; error: string;
  canUndo: boolean; canRedo: boolean;
}
const entries = new Map<string, InkStore>();
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
  private loading?: Promise<void>;
  constructor(readonly key: InkKey) {
    this.saved = emptyDocument(key.surface);
    this.state = { document: this.saved, revision: 0, loaded: false, status: 'loading', error: '', canUndo: false, canRedo: false };
  }
  snapshot = () => this.state;
  subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  private publish(patch: Partial<InkState>) {
    this.state = { ...this.state, ...patch, canUndo: !!this.undoStack.length, canRedo: !!this.redoStack.length };
    this.listeners.forEach(f => f()); notifyGlobal();
  }
  load = (): Promise<void> => {
    if (this.loading) return this.loading;
    if (this.state.loaded) return Promise.resolve();
    this.publish({ status: 'loading', error: '' });
    this.loading = readInk(this.key).then(record => {
      this.saved = record?.document ?? emptyDocument(this.key.surface);
      this.publish({ document: this.saved, revision: record?.revision ?? 0, loaded: true, status: 'saved' });
    }).catch(error => this.publish({ status: 'error', error: String(error instanceof Error ? error.message : error) }))
      .finally(() => { this.loading = undefined; });
    return this.loading;
  };
  change(update: (current: InkDocument) => InkDocument) {
    finishInkGestures();
    const document = update(this.state.document);
    if (!this.state.loaded || document === this.state.document) return;
    this.undoStack.push(this.state.document);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    this.publish({ document }); void this.flush();
  }
  undo = () => {
    finishInkGestures();
    const document = this.undoStack.pop(); if (!document) return;
    this.redoStack.push(this.state.document); this.publish({ document }); void this.flush();
  };
  redo = () => {
    finishInkGestures();
    const document = this.redoStack.pop(); if (!document) return;
    this.undoStack.push(this.state.document); this.publish({ document }); void this.flush();
  };
  dirty = () => this.state.loaded && this.state.document !== this.saved;
  flush = async () => {
    if (this.saving || !this.dirty() || this.state.status === 'error' || this.state.status === 'conflict') return;
    this.saving = true; this.publish({ status: 'saving', error: '' });
    try {
      while (this.dirty()) {
        const document = this.state.document;
        const record = await saveInk(this.key, document, this.state.revision);
        this.saved = document; this.publish({ revision: record.revision });
      }
      this.publish({ status: 'saved' });
    } catch (error) {
      this.publish({ status: error instanceof InkConflict ? 'conflict' : 'error', error: error instanceof Error ? error.message : String(error) });
    } finally { this.saving = false; }
  };
  retry = async () => {
    if (!this.state.loaded) return this.load();
    if (this.state.status === 'conflict') return; // Never rebase and silently overwrite another tab.
    this.publish({ status: 'saved', error: '' }); await this.flush();
  };
  // Caller must have exported the recovery buffer and confirmed discarding it.
  reload = async () => {
    if (this.saving) return;
    this.undoStack = []; this.redoStack = [];
    this.publish({ loaded: false }); await this.load();
  };
}
export function getInkStore(key: InkKey) {
  const id = keyId(key);
  let store = entries.get(id);
  if (!store) { store = new InkStore(key); entries.set(id, store); }
  return store;
}
export function flushInk() { for (const store of entries.values()) void store.flush(); }
