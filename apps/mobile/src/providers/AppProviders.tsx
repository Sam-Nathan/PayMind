import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRealtimeSync } from '../data/useRealtimeSync.ts';
import { CaptureSync } from '../features/capture/useCapture.ts';
import { AuthProvider } from './AuthProvider.tsx';

/** Mounts the single Supabase Realtime channel for the signed-in user. */
function RealtimeSync() {
  useRealtimeSync();
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RealtimeSync />
            <CaptureSync />
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
