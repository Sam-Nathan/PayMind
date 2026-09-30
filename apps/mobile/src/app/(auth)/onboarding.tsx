import { isValidVpa } from '@paymind/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthShell, Button, ErrorNote, TextField } from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import {
  setOnboardingSkipped,
  useProfile,
  useUpdateProfile,
} from '../../data/useProfile.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';

/** First sign-in: display name + UPI ID (so friends can pay you). */
export default function Onboarding() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const profile = useProfile();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const [name, setName] = useState(profile.data?.name ?? '');
  const [upi, setUpi] = useState(profile.data?.upiVpa ?? '');
  const [error, setError] = useState<string | null>(null);

  const finish = async (skipUpi: boolean) => {
    const trimmedName = name.trim();
    const trimmedUpi = upi.trim();
    if (!trimmedName) return setError('Tell us what to call you.');
    if (trimmedUpi && !isValidVpa(trimmedUpi)) return setError('That UPI ID looks off. It should look like name@bank.');
    setError(null);
    try {
      await update.mutateAsync({ name: trimmedName, upiVpa: skipUpi || !trimmedUpi ? null : trimmedUpi });
      if (uid && (skipUpi || !trimmedUpi)) {
        await setOnboardingSkipped(uid);
        qc.setQueryData(['onboarding-skipped', uid], true);
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <AuthShell title="One last thing" subtitle="Your name, and a UPI ID so friends can pay you back.">
      <TextField label="Display name" value={name} onChangeText={setName} placeholder="Sunny" autoComplete="name" />
      <TextField
        label="UPI ID (optional)"
        value={upi}
        onChangeText={setUpi}
        placeholder="sunny@okhdfc"
        autoCapitalize="none"
        keyboardType="email-address"
        helper="Only shown to people you share a space with."
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button label="Continue" size="lg" loading={update.isPending} onPress={() => finish(false)} />
      <Button label="Skip UPI for now" variant="ghost" onPress={() => finish(true)} disabled={update.isPending} />
    </AuthShell>
  );
}
