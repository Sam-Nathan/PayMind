import { paiseToRupeeString } from '@paymind/core';
import { setBalanceAction } from '../app/app/actions';
import type { SafeToSpendView } from '../lib/balance';

/** Manual balance + buffer input (stored in a cookie until Account Aggregator lands). */
export function BalanceForm({
  view,
  open = false,
  tone = 'dark',
}: {
  view: SafeToSpendView;
  open?: boolean;
  tone?: 'dark' | 'light';
}) {
  const dark = tone === 'dark';
  return (
    <details
      open={open || !view.hasBalance}
      className={`rounded-[18px] p-3 text-[14px] ${dark ? 'bg-oxblood-deep/70 text-text-on-dark' : 'bg-sand'}`}
    >
      <summary className="cursor-pointer select-none font-semibold">
        {view.hasBalance ? 'Update your balance' : 'Enter your bank balance'}
      </summary>
      <form action={setBalanceAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="balance"
            className={`mb-1 block text-[12px] font-semibold ${dark ? 'text-text-on-dark-muted' : 'text-text-muted'}`}
          >
            In your account (₹)
          </label>
          <input
            id="balance"
            name="balance"
            inputMode="decimal"
            placeholder="52,380"
            defaultValue={view.balanceMinor !== null ? paiseToRupeeString(view.balanceMinor) : ''}
            className="field !min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="buffer"
            className={`mb-1 block text-[12px] font-semibold ${dark ? 'text-text-on-dark-muted' : 'text-text-muted'}`}
          >
            Buffer to keep untouched (₹)
          </label>
          <input
            id="buffer"
            name="buffer"
            inputMode="decimal"
            defaultValue={paiseToRupeeString(view.bufferMinor)}
            className="field !min-h-[44px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className={dark ? 'btn bg-paper text-ink' : 'btn-dark'}>
            Save
          </button>
          {view.hasBalance ? (
            <button
              type="submit"
              name="clear"
              value="1"
              formNoValidate
              className={`text-[13px] font-semibold underline ${dark ? 'text-text-on-dark-muted' : 'text-text-muted'}`}
            >
              Clear
            </button>
          ) : null}
        </div>
        <p
          className={`text-[12px] sm:col-span-2 ${dark ? 'text-text-on-dark-muted' : 'text-text-muted'}`}
        >
          Stored only in this browser for now. PayMind never reads your bank account.
        </p>
      </form>
    </details>
  );
}
