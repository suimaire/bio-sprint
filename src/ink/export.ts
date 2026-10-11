import { downloadJSON } from '../storage';
import { INK_VERSION, SURFACES, inkKey, type InkScope, type InkDocument } from './model';
import { getInkStore } from './store';
import { strokePath } from './geometry';
import { finishInkGestures } from './gestures';

export const inkFilename = (scope: InkScope) => `bio-sprint-ink-v${INK_VERSION}-${scope.sessionId}-${scope.questionId}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
export async function exportQuestion(scope: InkScope) {
  finishInkGestures();
  const stores = SURFACES.map(surface => getInkStore(inkKey(scope, surface)));
  await Promise.all(stores.map(store => store.load()));
  downloadJSON({ ...scope, version: INK_VERSION, exportedAt: new Date().toISOString(),
    // Include explicit load errors rather than misrepresenting unread data as empty.
    surfaces: Object.fromEntries(stores.map(store => [store.key.surface, { ...store.snapshot(), key: store.key }])) }, inkFilename(scope) + '.json');
}
export async function exportNotePNG(scope: InkScope, document: InkDocument) {
  const paths = document.strokes.map(s => {
    // Colors are restricted by the toolbar; escape persisted values nonetheless.
    const color = /^#[\da-f]{6}$/i.test(s.color) ? s.color : '#202923';
    const highlight = s.tool === 'highlighter', tap = s.points.length === 1;
    return `<path d="${strokePath(s)}" fill="${highlight && !tap ? 'none' : color}" stroke="${highlight && !tap ? color : 'none'}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${highlight ? .28 : 1}"/>`;
  }).join('');
  const grid = document.background === 'grid' ? '<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 H 0 V 24" fill="none" stroke="#dce5dc" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>' : '';
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}"><rect width="100%" height="100%" fill="white"/>${grid}${paths}</svg>`;
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('PNG 생성에 실패했습니다. JSON 내보내기를 사용하세요.')); img.src = url; });
    // Respect iOS canvas limits for very long notes while keeping ordinary notes Retina sharp.
    const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12000000 / (document.width * document.height)), 16000 / document.height);
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.floor(document.width * scale); canvas.height = Math.floor(document.height * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('PNG 생성이 지원되지 않습니다. JSON 내보내기를 사용하세요.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 생성에 실패했습니다. JSON 내보내기를 사용하세요.')), 'image/png'));
    const download = URL.createObjectURL(blob), a = window.document.createElement('a');
    a.href = download; a.download = inkFilename(scope) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(download), 60000);
  } finally { URL.revokeObjectURL(url); }
}
