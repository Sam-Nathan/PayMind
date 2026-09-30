'use client';

import { useActionState, useState } from 'react';
import { createSpaceAction, type CreateSpaceState } from '../app/app/spaces/actions';
import { SPACE_TYPES } from '../lib/space-meta';
import type { SpaceType } from '../lib/types';
import { PlusIcon } from './icons';
import { SubmitButton } from './SubmitButton';
import { ErrorNote } from './ui';

export function CreateSpaceForm({ initialType = 'trip' }: { initialType?: SpaceType }) {
  const [state, action] = useActionState<CreateSpaceState, FormData>(createSpaceAction, {});
  const [type, setType] = useState<SpaceType>(initialType);
  const [rows, setRows] = useState<number[]>([0, 1]);
  const [nextId, setNextId] = useState(2);
  const current = SPACE_TYPES.find((t) => t.value === type);
  const dated = type === 'trip' || type === 'event';

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="label">What kind of space?</legend>
        <div className="flex flex-wrap gap-2">
          {SPACE_TYPES.map((t) => (
            <label key={t.value} className="cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-[40px] items-center rounded-full border border-hairline bg-white px-4 text-[15px] font-semibold peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:ring-2 peer-focus-visible:ring-signal">
                {t.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 rounded-[18px] bg-white p-3.5 text-[14px] text-text-muted">{current?.blurb}</p>
      </fieldset>

      <div>
        <label htmlFor="name" className="label">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder={type === 'trip' ? 'Goa Trip' : type === 'roommates' ? 'Flat 402' : 'Name your space'}
          className="field"
        />
      </div>

      {dated ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="starts_on" className="label">
              Starts
            </label>
            <input id="starts_on" name="starts_on" type="date" className="field" />
          </div>
          <div>
            <label htmlFor="ends_on" className="label">
              Ends
            </label>
            <input id="ends_on" name="ends_on" type="date" className="field" />
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor="budget" className="label">
          Budget (₹, optional)
        </label>
        <input id="budget" name="budget" inputMode="decimal" placeholder="75,000" className="field" />
      </div>

      <fieldset>
        <legend className="label">Other people (you are added automatically)</legend>
        <p className="mb-2 text-[13px] text-text-muted">
          They do not need the app. A UPI ID lets others pay them straight from PayMind.
        </p>
        <div className="space-y-2">
          {rows.map((id) => (
            <div key={id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                name="member_name"
                aria-label="Name"
                placeholder="Name"
                className="field"
                autoComplete="off"
              />
              <button
                type="button"
                aria-label="Remove person"
                onClick={() => setRows((r) => r.filter((x) => x !== id))}
                className="btn-outline !px-3 sm:order-last"
              >
                ✕
              </button>
              <input
                name="member_upi"
                aria-label="UPI ID (optional)"
                placeholder="UPI ID (optional)"
                className="field col-span-2 sm:col-span-1"
                autoComplete="off"
                autoCapitalize="none"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setRows((r) => [...r, nextId]);
            setNextId((n) => n + 1);
          }}
          className="btn-outline mt-3"
        >
          <PlusIcon width={18} height={18} /> Add a person
        </button>
      </fieldset>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Creating…">
        Create {current?.label.toLowerCase()} space
      </SubmitButton>
    </form>
  );
}
