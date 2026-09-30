'use client';

import { useActionState } from 'react';
import {
  deleteAccountAction,
  savePrivacyAction,
  type PrivacyState,
} from '../app/app/privacy/actions';
import type { PrivacySettings } from '../lib/types';
import { SubmitButton } from './SubmitButton';
import { ErrorNote } from './ui';

type Key = Exclude<keyof PrivacySettings, 'user_id' | 'aa_balance'>;

const GROUPS: { title: string; rows: { key: Key; title: string; desc: string }[] }[] = [
  {
    title: 'Connected sources',
    rows: [
      {
        key: 'capture_notifications',
        title: 'UPI & bank alerts',
        desc: 'Android app only. Reads payment notifications to suggest expenses. Nothing else on your phone.',
      },
      { key: 'ebills', title: 'E-bills from email', desc: 'Only messages from billers you pick.' },
      {
        key: 'keep_receipts',
        title: 'Keep receipt photos',
        desc: 'Off = we read the bill, then discard the image.',
      },
    ],
  },
  {
    title: 'What people in your spaces see',
    rows: [
      {
        key: 'share_payment_method',
        title: 'How I paid',
        desc: 'e.g. "UPI" or "cash" on settlements. Off by default.',
      },
    ],
  },
  {
    title: 'AI',
    rows: [
      {
        key: 'ai_enabled',
        title: 'Use AI to read bills and answer questions',
        desc: 'Off = manual entry and plain search only.',
      },
      {
        key: 'learn_from_corrections',
        title: 'Learn from my corrections',
        desc: 'Improves categories, merchants and split suggestions, for you only.',
      },
    ],
  },
];

export function PrivacySettingsForm({ settings }: { settings: PrivacySettings | null }) {
  const [state, action] = useActionState<PrivacyState, FormData>(savePrivacyAction, {});
  const [delState, delAction] = useActionState<PrivacyState, FormData>(deleteAccountAction, {});

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="overline mb-2 text-text-muted">{g.title}</h2>
            <ul className="divide-y divide-hairline rounded-[24px] border border-hairline bg-white">
              {g.rows.map((r) => (
                <li key={r.key}>
                  <label className="flex cursor-pointer items-center gap-4 px-4 py-4">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold">{r.title}</span>
                      <span className="block text-[13.5px] text-text-muted">{r.desc}</span>
                    </span>
                    <input
                      type="checkbox"
                      name={r.key}
                      defaultChecked={Boolean(settings?.[r.key])}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="relative h-[30px] w-[52px] shrink-0 rounded-full bg-stone transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-6 after:w-6 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-[22px] peer-focus-visible:ring-2 peer-focus-visible:ring-signal"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!settings ? (
          <ErrorNote>Your settings could not be loaded, so saving is disabled.</ErrorNote>
        ) : null}
        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.notice ? (
          <p role="status" className="text-[14px] font-semibold text-slate">
            {state.notice}
          </p>
        ) : null}
        {settings ? <SubmitButton className="btn-dark">Save settings</SubmitButton> : null}
      </form>

      <section className="rounded-[24px] border-[1.5px] border-signal bg-white p-5">
        <h2 className="text-[18px] font-bold text-signal">Delete my account</h2>
        <p className="mt-1 text-[14px] text-text-muted">
          Deleting your account removes your personal data. Shared expenses stay visible to the other
          people in them, with your name replaced by &ldquo;Former member&rdquo;. This cannot be
          undone.
        </p>
        <form action={delAction} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="confirm" className="label">
              Type DELETE to confirm
            </label>
            <input id="confirm" name="confirm" autoComplete="off" className="field" />
          </div>
          <SubmitButton className="btn-primary" pendingText="Deleting…">
            Delete my account
          </SubmitButton>
        </form>
        {delState.error ? (
          <div className="mt-3">
            <ErrorNote>{delState.error}</ErrorNote>
          </div>
        ) : null}
      </section>
    </div>
  );
}
