import '../../global.css';

import { colors } from '@paymind/ui-tokens';
import { useFonts } from 'expo-font';
import { useLinkingURL } from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNeedsOnboarding } from '../data/useProfile.ts';
import { fontMap } from '../lib/fonts.ts';
import { inviteCodeFromUrl, savePendingInvite } from '../lib/pendingInvite.ts';
import { AppProviders } from '../providers/AppProviders.tsx';
import { useAuth } from '../providers/AuthProvider.tsx';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Auth gating: signed-out -> (auth); signed-in -> (tabs), except on first sign-in where the
 * (auth) group stays mounted so onboarding (name + UPI ID) can run.
 */
function Routes() {
  const { session, loading } = useAuth();
  const needsOnboarding = useNeedsOnboarding();
  const url = useLinkingURL();
  const ready = !!session && needsOnboarding === false;

  // A signed-out (or not yet onboarded) user opening paymind://invite/CODE can't reach the invite
  // screen yet: keep the code; (tabs)/_layout opens it after sign-in and onboarding.
  // (A link already opened while signed in is not stashed again after a later sign-out.)
  const seenWhileReady = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (ready) {
      seenWhileReady.current = url;
      return;
    }
    const code = url !== seenWhileReady.current ? inviteCodeFromUrl(url) : null;
    if (code) void savePendingInvite(code);
  }, [url, ready, loading]);

  if (loading || (session && needsOnboarding === undefined)) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={colors.oxblood} />
      </View>
    );
  }

  const signedIn = !!session;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTitleStyle: { fontFamily: 'Onest_600SemiBold', color: colors.ink },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Protected guard={!signedIn || needsOnboarding === true}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsOnboarding === false}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-bill" options={{ title: 'Add bill', presentation: 'modal' }} />
        <Stack.Screen name="understand/[id]" options={{ title: 'Understand' }} />
        <Stack.Screen name="split/[id]" options={{ title: 'Split' }} />
        <Stack.Screen name="settle" options={{ title: 'Settle up' }} />
        <Stack.Screen name="pay/[id]" options={{ title: 'Pay' }} />
        <Stack.Screen name="verify/[id]" options={{ title: 'Verify payment' }} />
        <Stack.Screen name="voice" options={{ title: 'Voice', presentation: 'modal' }} />
        <Stack.Screen name="search" options={{ title: 'Search' }} />
        <Stack.Screen name="insights" options={{ title: 'Insights' }} />
        <Stack.Screen name="afford" options={{ title: 'Can I afford it?' }} />
        <Stack.Screen name="space/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="space-new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="expense-new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="trip-report/[id]" options={{ title: 'Trip report' }} />
        <Stack.Screen name="invite/[code]" options={{ title: 'Join a space' }} />
        <Stack.Screen name="space-invite" options={{ title: 'Invite' }} />
        <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
        <Stack.Screen name="recurring" options={{ title: 'Recurring' }} />
        <Stack.Screen name="goals" options={{ title: 'Goals' }} />
        <Stack.Screen name="timeline" options={{ title: 'Timeline' }} />
        <Stack.Screen name="budget-new" options={{ title: 'New budget', presentation: 'modal' }} />
        <Stack.Screen name="goal-new" options={{ title: 'New goal', presentation: 'modal' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy & data' }} />
        <Stack.Screen name="capture-inbox" options={{ title: 'Picked up automatically' }} />
        <Stack.Screen name="capture-permission" options={{ title: 'Auto-capture', presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Routes />
    </AppProviders>
  );
}
