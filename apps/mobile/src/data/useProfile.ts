import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { qk } from './keys.ts';
import { mapProfile } from './mappers.ts';
import type { Profile, ProfileRow } from './types.ts';

export function useProfile() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.profile(uid),
    enabled: !!uid,
    queryFn: async (): Promise<Profile | null> => {
      if (!uid) throw new Error('Not signed in.');
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },
  });
}

/** First name for greetings; falls back to the email handle. */
export function firstNameOf(profile: Profile | null | undefined, email?: string | null): string {
  const name = profile?.name?.trim();
  if (name) return name.split(/\s+/)[0] as string;
  const handle = email?.split('@')[0];
  return handle ? handle : 'there';
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (patch: { name?: string; upiVpa?: string | null }) => {
      if (!uid) throw new Error('not_authenticated: no session');
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row['name'] = patch.name;
      if (patch.upiVpa !== undefined) row['upi_vpa'] = patch.upiVpa;
      // upsert: the row is auto-created at sign-up, but don't fail if the trigger hasn't run.
      const { error } = await supabase.from('profiles').upsert({ id: uid, ...row });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile(uid) }),
  });
}

// ---------------------------------------------------------------------------
// Onboarding "skip UPI for now" flag (per user, device-local).

const skipKey = (uid: string) => `paymind.onboarding.skipUpi.${uid}`;

export async function getOnboardingSkipped(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(skipKey(uid))) === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingSkipped(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(skipKey(uid), '1');
  } catch {
    // non-fatal
  }
}

/**
 * First sign-in: ask for a display name and (optionally) a UPI ID.
 * `undefined` while we don't know yet (profile loading).
 */
export function useNeedsOnboarding(): boolean | undefined {
  const { session } = useAuth();
  const uid = session?.user.id;
  const profile = useProfile();
  const skipped = useQuery({
    queryKey: ['onboarding-skipped', uid],
    enabled: !!uid,
    queryFn: () => getOnboardingSkipped(uid as string),
    staleTime: Infinity,
  });
  if (!uid) return false;
  if (profile.isPending || skipped.isPending) return undefined;
  if (profile.isError) return false; // don't trap the user if the profile can't load
  const p = profile.data;
  if (!p?.name?.trim()) return true;
  return !p.upiVpa && !skipped.data;
}
