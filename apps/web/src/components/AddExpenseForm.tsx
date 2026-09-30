'use client';

import type { Json } from '@paymind/db';
import {
  rupeesToPaise,
  splitEqual,
  splitFixed,
  splitRatio,
  sumPaise,
  type Shares,
} from '@paymind/core';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { errMsg, friendlyDbError, inr2 } from '../lib/format';
import { createClient } from '../lib/supabase/client';
import type { Category } from '../lib/types';
import { ErrorNote } from './ui';

export interface FormMember {
  id: string;
  name: string;
  isYou: boolean;
}

type Method = 'equal' | 'ratio' | 'fixed';

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function AddExpenseForm({
  spaceId,
  members,
  myMemberId,
  categories,
}: {
  spaceId: string;
  members: FormMember[];
  myMemberId: string | null;
  categories: Category[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(myMemberId ?? members[0]?.id ?? '');
  const [paidVia, setPaidVia] = useState('upi');
  const [date, setDate] = useState(todayIST());
  const [categoryId, setCategoryId] = useState('');
  const [method, setMethod] = useState<Method>('equal');
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((m) => [m.id, true])),
  );
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, '1'])),
  );
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalMinor = useMemo(() => {
    try {
      const v = rupeesToPaise(amount);
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  }, [amount]);

  // Shares come from @paymind/core; the database only validates them.
  const split = useMemo<{ shares: Shares | null; problem: string | null }>(() => {
    if (totalMinor === null) return { shares: null, problem: null };
    try {
      if (method === 'equal') {
        const ids = members.filter((m) => included[m.id]).map((m) => m.id);
        if (ids.length === 0) return { shares: null, problem: 'Pick at least one person.' };
        return { shares: splitEqual(totalMinor, ids), problem: null };
      }
      if (method === 'ratio') {
        const w: Record<string, number> = {};
        for (const m of members) {
          const n = Number(weights[m.id]);
          if (Number.isFinite(n) && n > 0) w[m.id] = n;
        }
        if (Object.keys(w).length === 0) return { shares: null, problem: 'Give someone a share.' };
        return { shares: splitRatio(totalMinor, w), problem: null };
      }
      const amounts: Record<string, number> = {};
      for (const m of members) {
        const raw = (fixed[m.id] ?? '').trim();
        if (!raw) continue;
        const p = rupeesToPaise(raw);
        if (p > 0) amounts[m.id] = p;
      }
      const sum = sumPaise(Object.values(amounts));
      if (Object.keys(amounts).length === 0) return { shares: null, problem: 'Enter who owes what.' };
      if (sum !== totalMinor) {
        const diff = totalMinor - sum;
        return {
          shares: null,
          problem:
            diff > 0
              ? `${inr2(diff)} still to assign.`
              : `Amounts are ${inr2(-diff)} over the total.`,
        };
      }
      return { shares: splitFixed(totalMinor, amounts), problem: null };
    } catch (e) {
      return { shares: null, problem: errMsg(e) };
    }
  }, [method, totalMinor, members, included, weights, fixed]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!title.trim()) return setError('Add a short title, like "Dinner".');
    if (totalMinor === null) return setError('Enter an amount greater than zero.');
    if (!paidBy) return setError('Choose who paid.');
    if (!split.shares) return setError(split.problem ?? 'Check the split.');

    const occurred_at =
      date === todayIST() ? new Date().toISOString() : `${date}T12:00:00+05:30`;
    const payload: Record<string, unknown> = {
      space_id: spaceId,
      title: title.trim(),
      total_minor: totalMinor,
      occurred_at,
      paid_by_member: paidBy,
      paid_via: paidVia,
      source: 'manual',
      status: 'confirmed',
      shares: Object.entries(split.shares).map(([member_id, owed_minor]) => ({
        member_id,
        owed_minor,
      })),
    };
    if (categoryId) payload.category_id = categoryId;

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('create_expense', { p: payload as Json }) // payload is built and validated above; jsonb arg;
      if (rpcError) throw new Error(rpcError.message);
      setTitle('');
      setAmount('');
      setFixed({});
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(friendlyDbError(errMsg(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 !p-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div>
          <label htmlFor="exp-title" className="label">
            What was it for?
          </label>
          <input
            id="exp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tandoor House"
            maxLength={120}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="exp-amount" className="label">
            Amount (₹)
          </label>
          <input
            id="exp-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1,992"
            className="field"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="exp-paidby" className="label">
            Paid by
          </label>
          <select
            id="exp-paidby"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="field"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.isYou ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="exp-via" className="label">
            Paid with
          </label>
          <select
            id="exp-via"
            value={paidVia}
            onChange={(e) => setPaidVia(e.target.value)}
            className="field"
          >
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank transfer</option>
            <option value="wallet">Wallet</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="exp-date" className="label">
            Date
          </label>
          <input
            id="exp-date"
            type="date"
            value={date}
            max={todayIST()}
            onChange={(e) => setDate(e.target.value || todayIST())}
            className="field"
          />
        </div>
        {categories.length ? (
          <div>
            <label htmlFor="exp-cat" className="label">
              Category (optional)
            </label>
            <select
              id="exp-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="field"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <fieldset>
        <legend className="label">How to split it</legend>
        <div role="radiogroup" className="mb-3 inline-flex rounded-full bg-sand p-1">
          {(
            [
              ['equal', 'Equally'],
              ['ratio', 'By share'],
              ['fixed', 'Exact amounts'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => setMethod(value)}
              className={`min-h-[38px] rounded-full px-4 text-[14px] font-semibold ${
                method === value ? 'bg-ink text-paper' : 'text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="divide-y divide-hairline rounded-[18px] border border-hairline">
          {members.map((m) => {
            const owed = split.shares?.[m.id];
            return (
              <li key={m.id} className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
                {method === 'equal' ? (
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(included[m.id])}
                      onChange={(e) => setIncluded((s) => ({ ...s, [m.id]: e.target.checked }))}
                      className="h-5 w-5 accent-ink"
                    />
                    <span className="text-[15px] font-medium">{m.isYou ? `${m.name} (you)` : m.name}</span>
                  </label>
                ) : (
                  <span className="flex-1 text-[15px] font-medium">
                    {m.isYou ? `${m.name} (you)` : m.name}
                  </span>
                )}
                {method === 'ratio' ? (
                  <input
                    aria-label={`Share for ${m.name}`}
                    value={weights[m.id] ?? ''}
                    onChange={(e) => setWeights((s) => ({ ...s, [m.id]: e.target.value }))}
                    inputMode="decimal"
                    className="field !min-h-[40px] !w-20 text-center"
                  />
                ) : null}
                {method === 'fixed' ? (
                  <input
                    aria-label={`Amount for ${m.name}`}
                    value={fixed[m.id] ?? ''}
                    onChange={(e) => setFixed((s) => ({ ...s, [m.id]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                    className="field !min-h-[40px] !w-28 text-right"
                  />
                ) : null}
                <span className="w-24 text-right text-[14px] font-semibold tabular-nums text-text-muted">
                  {owed !== undefined ? inr2(owed) : ''}
                </span>
              </li>
            );
          })}
        </ul>
        {split.problem ? <p className="mt-2 text-[13px] text-rust">{split.problem}</p> : null}
      </fieldset>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {saved ? (
        <p role="status" className="rounded-[14px] bg-mist px-3.5 py-2.5 text-[14px] font-medium">
          Expense added.
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto">
        {busy ? 'Saving…' : 'Add expense'}
      </button>
    </form>
  );
}
