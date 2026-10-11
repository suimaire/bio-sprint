// Shared lifecycle boundary: flush the live preview into its document before
// exports, history changes and unload guards inspect the persistent buffer.
const finalizers = new Set<() => void>();
export function registerInkGesture(finish: () => void) {
  finalizers.add(finish);
  return () => { finalizers.delete(finish); };
}
export function finishInkGestures() { for (const finish of finalizers) finish(); }
