import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../../providers/AuthProvider.tsx';

export default function AuthLayout() {
  const { session } = useAuth();
  const router = useRouter();

  // Signed in but this group is still mounted => first-run onboarding is pending.
  useEffect(() => {
    if (session) router.replace('/onboarding');
  }, [session, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
