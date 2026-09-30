'use server';

import { deleteMyReceipts, type TablesUpdate } from '@paymind/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../lib/auth';
import { errMsg } from '../../../lib/format';
import { createClient } from '../../../lib/supabase/server';

export interface PrivacyState {
  error?: string;
  notice?: string;
}

const KEYS = [
  'capture_notifications',
  'ebills',
  'keep_receipts',
  'share_payment_method',
  'ai_enabled',
  'learn_from_corrections',
] as const;

export async function savePrivacyAction(_prev: PrivacyState, formData: FormData): Promise<PrivacyState> {
  const user = await requireUser();
  // Unchecked checkboxes are absent from FormData, so absence means "off".
  const patch: TablesUpdate<'privacy_settings'> = {};
  for (const k of KEYS) patch[k] = formData.get(k) !== null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('privacy_settings').update(patch).eq('user_id', user.id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath('/app/privacy');
  return { notice: 'Saved.' };
}

export async function deleteAccountAction(
  _prev: PrivacyState,
  formData: FormData,
): Promise<PrivacyState> {
  const user = await requireUser();
  if (String(formData.get('confirm') ?? '').trim() !== 'DELETE') {
    return { error: 'Type DELETE in capitals to confirm.' };
  }
  try {
    const supabase = await createClient();
    // Receipt photos live in Storage, which the deletion trigger cannot reach: remove them first.
    await deleteMyReceipts(supabase, user.id);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { error: error.message };
    await supabase.auth.signOut();
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect('/?deleted=1');
}
