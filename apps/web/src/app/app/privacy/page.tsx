import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivacySettingsForm } from '../../../components/PrivacySettingsForm';
import { Container, PageTitle } from '../../../components/ui';
import { requireUser } from '../../../lib/auth';
import { createClient } from '../../../lib/supabase/server';
import type { PrivacySettings } from '../../../lib/types';

export const metadata: Metadata = { title: 'Privacy & data' };

export default async function AppPrivacyPage() {
  const user = await requireUser();
  const supabase = await createClient();

  let settings: PrivacySettings | null = null;
  try {
    const { data } = await supabase
      .from('privacy_settings')
      .select(
        'user_id,capture_notifications,aa_balance,ebills,keep_receipts,ai_enabled,learn_from_corrections,share_payment_method',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    settings = (data as PrivacySettings | null) ?? null;
  } catch {
    settings = null;
  }

  return (
    <Container className="pt-6 md:pt-10">
      <PageTitle title="Privacy & data" />
      <div className="mt-6 rounded-[28px] bg-ink p-5 text-paper">
        <p className="text-[20px] font-semibold leading-snug">
          Your money data is yours. Every source is opt-in, and you can switch any of it off here.
        </p>
        <p className="mt-2 text-[15px] text-steel">
          PayMind never sees your UPI PIN or card details, and never moves money on its own.{' '}
          <Link href="/privacy" className="font-semibold underline">
            Read the privacy policy
          </Link>
          .
        </p>
      </div>
      <div className="mt-6">
        <PrivacySettingsForm settings={settings} />
      </div>
    </Container>
  );
}
