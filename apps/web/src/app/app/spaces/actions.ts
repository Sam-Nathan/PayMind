'use server';

import type { Enums } from '@paymind/db';
import { isValidVpa, rupeesToPaise } from '@paymind/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../lib/auth';
import { errMsg, friendlyDbError } from '../../../lib/format';
import { createClient } from '../../../lib/supabase/server';

export interface CreateSpaceState {
  error?: string;
}

const TYPES: Enums<'space_type'>[] = [
  'trip',
  'event',
  'couple',
  'family',
  'roommates',
  'friends',
  'college',
  'office',
  'custom',
];

export async function createSpaceAction(
  _prev: CreateSpaceState,
  formData: FormData,
): Promise<CreateSpaceState> {
  await requireUser();

  const name = String(formData.get('name') ?? '').trim();
  const type = String(formData.get('type') ?? 'friends');
  const startsOn = String(formData.get('starts_on') ?? '').trim() || null;
  const endsOn = String(formData.get('ends_on') ?? '').trim() || null;
  const budgetRaw = String(formData.get('budget') ?? '').trim();

  if (!name) return { error: 'Give your space a name.' };
  const spaceType = TYPES.find((t) => t === type);
  if (!spaceType) return { error: 'Pick a space type.' };
  if (startsOn && endsOn && endsOn < startsOn) return { error: 'The end date is before the start.' };

  let budgetMinor: number | null = null;
  if (budgetRaw) {
    try {
      budgetMinor = rupeesToPaise(budgetRaw);
      if (budgetMinor <= 0) return { error: 'Budget must be more than zero.' };
    } catch {
      return { error: 'Enter the budget as a number, like 15000.' };
    }
  }

  const names = formData.getAll('member_name').map((v) => String(v).trim());
  const upis = formData.getAll('member_upi').map((v) => String(v).trim());
  const members: { display_name: string; upi_vpa?: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const display_name = names[i] ?? '';
    const upi = upis[i] ?? '';
    if (!display_name && !upi) continue;
    if (!display_name) return { error: 'Every member with a UPI ID needs a name.' };
    if (upi && !isValidVpa(upi)) return { error: `"${upi}" is not a valid UPI ID (like name@bank).` };
    members.push(upi ? { display_name, upi_vpa: upi } : { display_name });
  }

  let spaceId: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('create_space', {
      p_name: name,
      p_type: spaceType,
      // The SQL defaults for the optional args are null, so undefined means the same thing.
      p_starts_on: startsOn ?? undefined,
      p_ends_on: endsOn ?? undefined,
      p_budget_minor: budgetMinor ?? undefined,
      p_members: members,
    });
    if (error) return { error: friendlyDbError(error.message) };
    spaceId = typeof data === 'string' ? data : null;
  } catch (e) {
    return { error: friendlyDbError(errMsg(e)) };
  }

  revalidatePath('/app', 'layout');
  redirect(spaceId ? `/app/spaces/${spaceId}` : '/app/spaces');
}
