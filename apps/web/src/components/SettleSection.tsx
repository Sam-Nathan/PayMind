'use client';

import { buildUpiUri, isValidVpa } from '@paymind/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errMsg, friendlyDbError, inr2 } from '../lib/format';
import { createClient } from '../lib/supabase/client';
import { QrCode } from './QrCode';
import { Disclosure, ErrorNote } from './ui';

export interface DebtItem {
  /** Present when this is an in-progress settlement (initiated / pending). */
  settlementId?: string;
  status?: string;
  from: string;
  to: string;
  amountMinor: number;
  fromName: string;
  toName: string;
  toVpa: string | null;
}

interface Panel {
  settlementId: string;
  uri: string;
  item: DebtItem;
}

type Method = 'cash' | 'bank' | 'other';

function monthTag(): string {
  return new Date()
    .toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Kolkata' })
    .toUpperCase();
}

export function SettleSection({
  spaceId,
  spaceName,
  myMemberId,
  transfers,
  inProgress,
}: {
  spaceId: string;
  spaceName: string;
  myMemberId: string | null;
  transfers: DebtItem[];
  inProgress: DebtItem[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('cash');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noteRef = `PM-${spaceId.slice(0, 4).toUpperCase()}-${monthTag()}`;
  const keyOf = (t: DebtItem) => `${t.from}:${t.to}:${t.amountMinor}`;

  function uriFor(item: DebtItem, settlementId: string): string {
    return buildUpiUri({
      pa: (item.toVpa as string).trim(),
      pn: item.toName,
      am: item.amountMinor,
      tn: `${noteRef} · ${spaceName}`,
      tr: `${noteRef}-${settlementId.slice(0, 8)}`,
    });
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(friendlyDbError(errMsg(e)));
    } finally {
      setBusy(null);
    }
  }

  function payWithUpi(item: DebtItem) {
    return run(keyOf(item), async () => {
      let id = item.settlementId;
      if (!id) {
        // Reuse an in-progress settlement for the same payment instead of creating duplicates.
        const existing = inProgress.find(
          (s) => s.from === item.from && s.to === item.to && s.amountMinor === item.amountMinor,
        );
        id = existing?.settlementId;
      }
      if (!id) {
        const supabase = createClient();
        const { data, error: e } = await supabase.rpc('record_settlement', {
          p_space_id: spaceId,
          p_from_member: item.from,
          p_to_member: item.to,
          p_amount_minor: item.amountMinor,
          p_method: 'upi',
          p_status: 'initiated',
          p_note_ref: noteRef,
        });
        if (e) throw new Error(e.message);
        id = data as string;
      }
      setPanel({ settlementId: id, uri: uriFor(item, id), item });
    });
  }

  function markManual(item: DebtItem) {
    return run(keyOf(item), async () => {
      const supabase = createClient();
      const { error: e } = await supabase.rpc('record_settlement', {
        p_space_id: spaceId,
        p_from_member: item.from,
        p_to_member: item.to,
        p_amount_minor: item.amountMinor,
        p_method: method,
        p_status: 'confirmed_manual',
        p_note_ref: noteRef,
      });
      if (e) throw new Error(e.message);
      setManualKey(null);
    });
  }

  function setStatus(settlementId: string, status: 'completed' | 'cancelled') {
    return run(settlementId, async () => {
      const supabase = createClient();
      const { error: e } = await supabase.rpc('update_settlement_status', {
        p_id: settlementId,
        p_status: status,
      });
      if (e) throw new Error(e.message);
      setPanel(null);
    });
  }

  const renderRow = (t: DebtItem, rowKey: string) => {
    const iPay = myMemberId !== null && t.from === myMemberId;
    const iReceive = myMemberId !== null && t.to === myMemberId;
    const key = t.settlementId ?? keyOf(t);
    const canUpi = iPay && t.toVpa !== null && isValidVpa(t.toVpa);
    return (
      <li key={rowKey} className="rounded-[16px] bg-ink-soft p-3.5 text-paper">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px]">
            <b>{iPay ? 'You' : t.fromName}</b> → <b>{iReceive ? 'You' : t.toName}</b>
            {t.status ? (
              <span className="ml-2 rounded-full bg-clay px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink">
                {t.status}
              </span>
            ) : null}
          </p>
          <p className="text-[16px] font-bold tabular-nums">{inr2(t.amountMinor)}</p>
        </div>

        {t.settlementId ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {canUpi ? (
              <button
                type="button"
                className="btn bg-paper !min-h-[40px] text-ink"
                disabled={busy !== null}
                onClick={() => payWithUpi(t)}
              >
                Show QR
              </button>
            ) : null}
            <button
              type="button"
              className="btn bg-signal !min-h-[40px] text-white"
              disabled={busy !== null}
              onClick={() => setStatus(t.settlementId as string, 'completed')}
            >
              {iReceive ? 'Received' : 'Yes, it went through'}
            </button>
            <button
              type="button"
              className="btn border border-paper/25 !min-h-[40px] text-paper"
              disabled={busy !== null}
              onClick={() => setStatus(t.settlementId as string, 'cancelled')}
            >
              Cancel
            </button>
          </div>
        ) : iPay || iReceive ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {iPay ? (
              canUpi ? (
                <button
                  type="button"
                  className="btn bg-signal !min-h-[44px] text-white"
                  disabled={busy !== null}
                  onClick={() => payWithUpi(t)}
                >
                  {busy === key ? 'Opening…' : 'Pay with UPI'}
                </button>
              ) : (
                <span className="self-center text-[13px] text-steel">
                  {t.toName} has not added a UPI ID yet.
                </span>
              )
            ) : null}
            <button
              type="button"
              className="btn border border-paper/25 !min-h-[44px] text-paper"
              onClick={() => setManualKey(manualKey === key ? null : key)}
            >
              {iPay ? 'Mark as paid (cash/other)' : 'Mark as received (cash/other)'}
            </button>
          </div>
        ) : null}

        {manualKey === key ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-[14px] bg-ink p-3">
            <div>
              <label htmlFor={`m-${key}`} className="mb-1 block text-[12px] font-semibold text-steel">
                How was it paid?
              </label>
              <select
                id={`m-${key}`}
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="field !min-h-[40px] !w-auto"
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
                <option value="other">Another way</option>
              </select>
            </div>
            <button
              type="button"
              className="btn bg-paper !min-h-[40px] text-ink"
              disabled={busy !== null}
              onClick={() => markManual(t)}
            >
              {busy === key ? 'Saving…' : `Confirm ${inr2(t.amountMinor)}`}
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  const all = [...inProgress, ...transfers];

  return (
    <div className="space-y-3">
      {all.length === 0 ? (
        <div className="rounded-[24px] bg-ink p-5 text-center text-paper">
          <p className="text-[17px] font-semibold">You are all square.</p>
          <p className="text-[14px] text-steel">Nobody owes anything in this space.</p>
        </div>
      ) : (
        <div className="rounded-[28px] bg-ink p-4 text-paper md:p-5">
          <p className="overline text-steel">{spaceName} · simplified</p>
          <p className="mt-2 text-[15px] text-paper/80">
            {transfers.length} {transfers.length === 1 ? 'payment settles' : 'payments settle'}{' '}
            everything. Nobody pays more than they owe overall.
          </p>
          <ul className="mt-3 space-y-2">
            {inProgress.map((t) => renderRow(t, `ip-${t.settlementId}`))}
            {transfers.map((t) => renderRow(t, keyOf(t)))}
          </ul>
        </div>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {panel ? (
        <div className="card !p-5" role="dialog" aria-label="Pay with UPI">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="overline text-text-muted">Pay with UPI</p>
              <p className="mt-1 text-[22px] font-bold">
                {inr2(panel.item.amountMinor)} to {panel.item.toName}
              </p>
              <p className="text-[13px] text-text-muted">{panel.item.toVpa}</p>
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="btn-pill"
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <QrCode value={panel.uri} label={`UPI QR code for ${inr2(panel.item.amountMinor)}`} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-[14px]">
                Scan with any UPI app, or on your phone tap the button to open your UPI app with
                everything filled in.
              </p>
              <a href={panel.uri} className="btn-primary w-full sm:w-auto">
                Open UPI app
              </a>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-dark"
                  disabled={busy !== null}
                  onClick={() => setStatus(panel.settlementId, 'completed')}
                >
                  Yes, it went through
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busy !== null}
                  onClick={() => setStatus(panel.settlementId, 'cancelled')}
                >
                  Cancel payment
                </button>
              </div>
              <p className="text-[12px] text-text-muted">
                Only tap &ldquo;Yes&rdquo; after your UPI app says it succeeded. Closing this keeps
                the payment as in progress.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Disclosure />
          </div>
        </div>
      ) : null}
    </div>
  );
}
