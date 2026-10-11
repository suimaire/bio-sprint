export const INK_VERSION = 1 as const;
export const ANNOTATION_WIDTH = 640;
export const SURFACES = ['scratchpad', 'stem', 'statement'] as const;
export type InkSurface = typeof SURFACES[number];
export interface InkScope { sessionId: string; runId: string; questionId: string }
export interface InkKey extends InkScope { surface: InkSurface; version: typeof INK_VERSION }
export interface InkPoint { x: number; y: number; pressure: number }
export interface InkStroke {
  id: string; tool: 'pen' | 'highlighter'; color: string; width: number;
  points: InkPoint[];
}
export interface InkDocument {
  width: number; height: number; background: 'plain' | 'grid'; strokes: InkStroke[];
}
export interface InkRecord { key: InkKey; document: InkDocument; revision: number; updatedAt: number }
export interface InkTools { tool: 'pen' | 'highlighter' | 'eraser'; color: string; size: 1 | 2 | 3; mouse: boolean }
export const defaultTools: InkTools = { tool: 'pen', color: '#202923', size: 2, mouse: false };
export const surfaceLabels: Record<InkSurface, string> = { scratchpad: '풀이 노트', stem: '문제 본문', statement: '합답 진술' };
export const inkKey = (scope: InkScope, surface: InkSurface): InkKey => ({ ...scope, surface, version: INK_VERSION });
export const keyId = (key: InkKey) => JSON.stringify([key.sessionId, key.runId, key.questionId, key.surface, key.version]);
export const emptyDocument = (surface: InkSurface): InkDocument => ({ width: surface === 'scratchpad' ? 720 : ANNOTATION_WIDTH, height: surface === 'scratchpad' ? 960 : 160, background: 'plain', strokes: [] });
