import { describe, expect, it } from 'vitest';
import { buildIngestBatch, parseCapture, toIstIso, type RawCaptureInput } from './pipeline.ts';
import { runCaptureSync, type SyncDeps } from './syncEngine.ts';

// 2026-10-14 09:12 IST
const T = Date.UTC(2026, 9, 14, 3, 42, 0);

function raw(id: string, packageName: string, title: string, text: string, postTime = T): RawCaptureInput {
  return { id, packageName, title, text, postTime };
}

describe('toIstIso', () => {
  it('formats in IST', () => {
    expect(toIstIso(T)).toBe('2026-10-14T09:12:00+05:30');
  });
  it('rolls the day over at IST midnight', () => {
    expect(toIstIso(Date.UTC(2026, 9, 14, 19, 0, 0))).toBe('2026-10-15T00:30:00+05:30');
  });
});

describe('parseCapture / buildIngestBatch', () => {
  it('parses a PhonePe debit and uploads only minimal fields', () => {
    const r = raw('a', 'com.phonepe.app', 'Paid ₹240', 'Paid to Brew Street Cafe');
    const parsed = parseCapture(r);
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(24000);

    const { entries } = buildIngestBatch([r]);
    expect(entries).toHaveLength(1);
    const item = entries[0]!.item;
    expect(item.direction).toBe('debit');
    expect(item.amountMinor).toBe(24000);
    expect(item.app).toBe('phonepe');
    expect(item.occurredAt).toBe('2026-10-14T09:12:00+05:30');
    expect(item.dedupeHash).toMatch(/^[0-9a-f]{16}$/);
    // Minimal fields only: never the notification text.
    expect(Object.keys(item).sort()).toEqual(
      ['amountMinor', 'app', 'dedupeHash', 'direction', 'occurredAt', 'payee'].sort(),
    );
    expect(JSON.stringify(item)).not.toContain('Paid to');
  });

  it('parses a bank SMS shown as a Google Messages notification', () => {
    const r = raw(
      'b',
      'com.google.android.apps.messaging',
      'VM-HDFCBK',
      'Rs.500.00 debited from a/c **1234 on 13-10-26 to VPA metro@ybl (UPI Ref No 628455501122).',
    );
    const { entries } = buildIngestBatch([r]);
    expect(entries).toHaveLength(1);
    const item = entries[0]!.item;
    expect(item.amountMinor).toBe(50000);
    expect(item.vpa).toBe('metro@ybl');
    // The text says 13-10-26 but the alert arrived on the 14th: the printed date wins.
    expect(item.occurredAt).toBe('2026-10-13T12:00:00+05:30');
  });

  it('drops OTPs, promos and failed payments without uploading them', () => {
    const batch = buildIngestBatch([
      raw('otp', 'com.google.android.apps.messaging', 'HDFCBK', 'Your OTP for Rs 500 payment is 123456'),
      raw('promo', 'in.amazon.mShop.android.shopping', 'Amazon', 'Win Rs 500 cashback! Offer ends soon'),
      raw('fail', 'com.phonepe.app', 'Payment failed', 'Payment of Rs 240 failed'),
    ]);
    expect(batch.entries).toHaveLength(0);
    expect(batch.droppedIds.sort()).toEqual(['fail', 'otp', 'promo']);
  });

  it('collapses the same payment seen twice (same UPI ref) into one upload, keeping both ids', () => {
    const sms = raw(
      'sms',
      'com.google.android.apps.messaging',
      'VM-HDFCBK',
      'Rs.240.00 debited from a/c **1234 on 14-10-26 to VPA brewstreet@ybl (UPI Ref No 628455501122).',
      T + 5_000,
    );
    const again = raw(
      'sms2',
      'com.samsung.android.messaging',
      'VM-HDFCBK',
      'Rs.240.00 debited from a/c **1234 on 14-10-26 to VPA brewstreet@ybl (UPI Ref No 628455501122).',
      T + 9_000,
    );
    const { entries } = buildIngestBatch([sms, again]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ids).toEqual(['sms', 'sms2']);
  });

  it('keeps credits, flagged by direction', () => {
    const r = raw('c', 'com.google.android.apps.nbu.paisa.user', 'Google Pay', 'Rahul paid you ₹1,200');
    const { entries } = buildIngestBatch([r]);
    expect(entries[0]?.item.direction).toBe('credit');
    expect(entries[0]?.item.amountMinor).toBe(120000);
  });
});

describe('runCaptureSync', () => {
  function makeDeps(over: Partial<SyncDeps> & { pending?: RawCaptureInput[] } = {}) {
    const state = {
      queue: [...(over.pending ?? [])],
      ingested: [] as unknown[][],
      nativeEnabled: undefined as boolean | undefined,
    };
    const deps: SyncDeps = {
      readEnabled: async () => true,
      setNativeEnabled: async (e) => {
        state.nativeEnabled = e;
      },
      getPending: async () => [...state.queue],
      ack: async (ids) => {
        state.queue = state.queue.filter((q) => !ids.includes(q.id));
      },
      ingest: async (items) => {
        state.ingested.push(items);
        return true;
      },
      ...over,
    };
    return { deps, state };
  }

  const pay = raw('p1', 'com.phonepe.app', 'Paid ₹240', 'Paid to Brew Street Cafe');
  const junk = raw('j1', 'com.google.android.apps.messaging', 'HDFCBK', 'Your OTP for Rs 500 is 123456');

  it('uploads parsed payments, acks everything, drops junk locally', async () => {
    const { deps, state } = makeDeps({ pending: [pay, junk] });
    const res = await runCaptureSync(deps);
    expect(res).toEqual({ status: 'done', uploaded: 1, dropped: 1 });
    expect(state.ingested).toHaveLength(1);
    expect(state.queue).toHaveLength(0);
    expect(state.nativeEnabled).toBe(true);
  });

  it('never uploads and purges the queue when capture is off', async () => {
    const { deps, state } = makeDeps({ pending: [pay], readEnabled: async () => false });
    const res = await runCaptureSync(deps);
    expect(res).toEqual({ status: 'off', purged: 1 });
    expect(state.ingested).toHaveLength(0);
    expect(state.queue).toHaveLength(0);
    expect(state.nativeEnabled).toBe(false);
  });

  it('does nothing when the setting cannot be read', async () => {
    const { deps, state } = makeDeps({ pending: [pay], readEnabled: async () => null });
    expect(await runCaptureSync(deps)).toEqual({ status: 'skipped' });
    expect(state.queue).toHaveLength(1);
  });

  it('keeps items queued when the upload fails (retry later)', async () => {
    const { deps, state } = makeDeps({ pending: [pay], ingest: async () => false });
    const res = await runCaptureSync(deps);
    expect(res.status).toBe('error');
    expect(state.queue.map((q) => q.id)).toEqual(['p1']);
  });

  it('keeps items queued when the upload throws', async () => {
    const { deps, state } = makeDeps({
      pending: [pay],
      ingest: async () => {
        throw new Error('offline');
      },
    });
    expect((await runCaptureSync(deps)).status).toBe('error');
    expect(state.queue).toHaveLength(1);
  });

  it('is idle with an empty queue', async () => {
    const { deps } = makeDeps();
    expect(await runCaptureSync(deps)).toEqual({ status: 'idle' });
  });
});
