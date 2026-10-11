import { completeQFCancellation, loadData, type Snapshot } from './storage';
import { deleteSessionInk } from './ink/storage';
import { discardSessionInk } from './ink/store';

export class QFCancellationRecoveryError extends Error {}

// Both databases retain a minimal tombstone; learning data is removed. Repeating
// any step is safe, including after closing Safari between the two transactions.
export async function recoverQFCancellations(snapshot?: Snapshot): Promise<Snapshot> {
  const value = snapshot ?? await loadData();
  for (const marker of value.qfCancellations ?? []) {
    await discardSessionInk(marker.sessionId);
    if (marker.pending) {
      await deleteSessionInk(marker.sessionId);
      await completeQFCancellation(marker.sessionId);
    }
  }
  return value.qfCancellations?.some(m => m.pending) ? loadData() : value;
}
