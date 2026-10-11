import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InkStore } from './store';
import { inkKey, type InkRecord, type InkStroke } from './model';

// Only persistence is replaced here; history, gesture finalization and the save loop are real.
const disk = vi.hoisted(() => ({ records: new Map<string, InkRecord>(), writes: [] as InkRecord[] }));
vi.mock('./storage', async () => {
  const { keyId } = await import('./model');
  return {
    InkConflict: class extends Error {},
    readInk: async (key: InkRecord['key']) => disk.records.get(keyId(key)),
    saveInk: async (key: InkRecord['key'], document: InkRecord['document'], revision: number) => {
      const record = { key, document, revision: revision + 1, updatedAt: 1 };
      disk.records.set(keyId(key), record); disk.writes.push(record); return record;
    },
  };
});
const original: InkStroke = { id: 'stroke', tool: 'pen', color: '#245FBD', width: 3.5,
  points: [{ x: 0, y: 0, pressure: .6 }, { x: 50, y: 2, pressure: .7 }, { x: 100, y: 0, pressure: .6 }] };
const line: InkStroke = { ...original, shape: 'line', points: [original.points[0], original.points[2]] };
const scope = { sessionId: 'test', runId: 'run', questionId: 'q1' };
beforeEach(() => { disk.records.clear(); disk.writes.length = 0; });
describe('atomic corrected stroke history', () => {
  it('writes the final document once, but undoes line → freehand → absent and redoes both', async () => {
    const store = new InkStore(inkKey(scope, 'stem')); await store.load();
    store.commitStroke(line, original, 200); await vi.waitFor(() => expect(store.snapshot().status).toBe('saved'));
    expect(disk.writes).toHaveLength(1);
    expect(disk.writes[0].document.strokes).toEqual([line]);
    expect(store.snapshot().document.height).toBe(200);
    store.undo(); expect(store.snapshot().document.strokes).toEqual([original]);
    store.undo(); expect(store.snapshot().document.strokes).toEqual([]);
    store.redo(); expect(store.snapshot().document.strokes).toEqual([original]);
    store.redo(); expect(store.snapshot().document.strokes).toEqual([line]);
    await vi.waitFor(() => expect(store.snapshot().status).toBe('saved'));
    const reload = new InkStore(inkKey(scope, 'stem')); await reload.load();
    expect(reload.snapshot().document.strokes).toEqual([line]);
  });
  it('keeps old freehand data and isolates history by question and surface', async () => {
    const stem = new InkStore(inkKey(scope, 'stem'));
    const note = new InkStore(inkKey(scope, 'scratchpad'));
    const other = new InkStore(inkKey({ ...scope, questionId: 'q2' }, 'stem'));
    await Promise.all([stem.load(), note.load(), other.load()]);
    stem.change(current => ({ ...current, strokes: [original] }));
    note.commitStroke(line, original); other.commitStroke(original);
    note.undo(); note.undo();
    expect(note.snapshot().document.strokes).toEqual([]);
    expect(stem.snapshot().document.strokes).toEqual([original]);
    expect(other.snapshot().document.strokes).toEqual([original]);
    await vi.waitFor(() => expect(stem.snapshot().status).toBe('saved'));
    const reload = new InkStore(inkKey(scope, 'stem')); await reload.load();
    expect(reload.snapshot().document.strokes[0]).toEqual(original);
  });
});
