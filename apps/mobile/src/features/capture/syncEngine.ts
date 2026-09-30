/**
 * Sync engine: native queue -> on-device parse -> `capture-ingest` -> ack.
 * Dependencies are injected so the flow is unit-testable without React Native or Supabase.
 */
import { buildIngestBatch, chunk, type IngestItem, type RawCaptureInput } from './pipeline.ts';

export interface SyncDeps {
  /**
   * privacy_settings.capture_notifications. `null` = could not tell (offline): do nothing.
   * Signed out counts as `false`.
   */
  readEnabled(): Promise<boolean | null>;
  /** Mirror the setting into the native module (off = listener stores nothing, queue cleared). */
  setNativeEnabled(enabled: boolean): Promise<void>;
  getPending(): Promise<RawCaptureInput[]>;
  ack(ids: string[]): Promise<void>;
  /** POST minimal items to the `capture-ingest` Edge Function. Resolves true on success. */
  ingest(items: IngestItem[]): Promise<boolean>;
}

export type SyncResult =
  | { status: 'skipped' }
  | { status: 'off'; purged: number }
  | { status: 'idle' }
  | { status: 'done'; uploaded: number; dropped: number }
  | { status: 'error'; uploaded: number; dropped: number };

export const INGEST_BATCH_SIZE = 50;

export async function runCaptureSync(deps: SyncDeps): Promise<SyncResult> {
  const enabled = await deps.readEnabled();
  if (enabled === null) return { status: 'skipped' };

  await deps.setNativeEnabled(enabled);
  const pending = await deps.getPending();

  if (!enabled) {
    // Consent is off: never upload, and do not keep raw text around.
    if (pending.length > 0) await deps.ack(pending.map((p) => p.id));
    return { status: 'off', purged: pending.length };
  }
  if (pending.length === 0) return { status: 'idle' };

  const { entries, droppedIds } = buildIngestBatch(pending);
  // Non-payments are deleted right away; they never leave the device.
  if (droppedIds.length > 0) await deps.ack(droppedIds);

  let uploaded = 0;
  for (const group of chunk(entries, INGEST_BATCH_SIZE)) {
    let ok = false;
    try {
      ok = await deps.ingest(group.map((e) => e.item));
    } catch {
      ok = false;
    }
    // On failure keep the raw items queued so the next foreground sync retries.
    if (!ok) return { status: 'error', uploaded, dropped: droppedIds.length };
    await deps.ack(group.flatMap((e) => e.ids));
    uploaded += group.length;
  }
  return { status: 'done', uploaded, dropped: droppedIds.length };
}
