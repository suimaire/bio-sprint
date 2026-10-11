export const INK_VERSION = 1 as const;
export const ANNOTATION_WIDTH = 640;
export const CARD_WIDTH = ANNOTATION_WIDTH + 64;
export const SURFACES = ['scratchpad', 'stem', 'statement', 'card'] as const;
export type InkSurface = typeof SURFACES[number];
export interface InkScope { sessionId: string; runId: string; questionId: string }
export interface InkKey extends InkScope { surface: InkSurface; version: typeof INK_VERSION }
export interface InkPoint { x: number; y: number; pressure: number }
export interface InkStroke {
  id: string; tool: 'pen' | 'highlighter'; color: string; width: number;
  points: InkPoint[];
  shape?: 'line';
}
export interface InkDocument {
  width: number; height: number; background: 'plain' | 'grid'; strokes: InkStroke[];
}
export interface InkRecord { key: InkKey; document: InkDocument; revision: number; updatedAt: number }
export interface InkTools {
  selectedTool: 'pen' | 'highlighter' | 'eraser';
  penColor: string; highlighterColor: string;
  penWidth: number; highlighterWidth: number; mouseDevelopmentMode: boolean;
}
export const defaultTools: InkTools = { selectedTool: 'pen', penColor: '#202923', highlighterColor: '#F5C542', penWidth: 3.5, highlighterWidth: 20, mouseDevelopmentMode: false };
export const inkColors = {
  pen: [['#202923', '검정'], ['#245FBD', '파랑'], ['#C43E36', '빨강'], ['#218A58', '초록']],
  highlighter: [['#F5C542', '노랑'], ['#9BE15D', '초록'], ['#FF95B8', '분홍'], ['#91CDFF', '파랑'], ['#FFC078', '주황']],
} as const;
export const surfaceLabels: Record<InkSurface, string> = { scratchpad: '풀이 노트', stem: '문제 본문', statement: '합답 진술', card: '문제 카드 여백·선지' };
export const inkKey = (scope: InkScope, surface: InkSurface): InkKey => ({ ...scope, surface, version: INK_VERSION });
export const keyId = (key: InkKey) => JSON.stringify([key.sessionId, key.runId, key.questionId, key.surface, key.version]);
export const emptyDocument = (surface: InkSurface): InkDocument => ({ width: surface === 'scratchpad' ? 720 : surface === 'card' ? CARD_WIDTH : ANNOTATION_WIDTH, height: surface === 'scratchpad' ? 960 : 160, background: 'plain', strokes: [] });
