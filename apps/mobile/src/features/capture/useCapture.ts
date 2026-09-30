import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as PaymindCapture from '../../../modules/paymind-capture';
import { supabase } from '../../lib/supabase.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';
import { queryKeys, usePrivacySettings } from './data.ts';
import type { IngestItem } from './pipeline.ts';
import { runCaptureSync, type SyncDeps, type SyncResult } from './syncEngine.ts';

/** Real dependencies: native module + Supabase. All no-ops where the module is absent. */
export const liveDeps: SyncDeps = {
  async readEnabled() {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return false;
    const { data, error } = await supabase
      .from('privacy_settings')
      .select('capture_notifications')
      .maybeSingle();
    if (error) return null;
    return Boolean((data as { capture_notifications?: boolean } | null)?.capture_notifications);
  },
  setNativeEnabled: (enabled) => PaymindCapture.setCaptureEnabled(enabled),
  getPending: () => PaymindCapture.getPending(),
  ack: (ids) => PaymindCapture.ack(ids),
  async ingest(items: IngestItem[]) {
    const { error } = await supabase.functions.invoke('capture-ingest', { body: { items } });
    return !error;
  },
};

let inFlight: Promise<SyncResult> | null = null;

/** Runs one sync at a time; concurrent callers share the running one. */
export function syncCaptureNow(): Promise<SyncResult> {
  if (!PaymindCapture.isSupported()) return Promise.resolve({ status: 'skipped' });
  if (!inFlight) {
    inFlight = runCaptureSync(liveDeps)
      .catch((): SyncResult => ({ status: 'skipped' }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Background sync: on sign-in, on app foreground and when the native listener queues an alert.
 * Mount once via <CaptureSync /> under AuthProvider. No-op in Expo Go / iOS / web.
 */
export function useCaptureSync() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!PaymindCapture.isSupported()) return;
    const run = () => {
      void syncCaptureNow().then((r) => {
        if (r.status === 'done' && r.uploaded > 0) void qc.invalidateQueries({ queryKey: ['captured_txns'] });
      });
    };
    run();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    const capSub = PaymindCapture.addListener('onCapture', () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, 1500);
    });
    return () => {
      appSub.remove();
      capSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uid, qc]);
}

/** Renders nothing; mount inside AuthProvider (see report). */
export function CaptureSync() {
  useCaptureSync();
  return null;
}

/** State for screens: platform support, system permission, and the privacy setting. */
export function useCapture() {
  const supported = PaymindCapture.isSupported();
  const settings = usePrivacySettings();
  const qc = useQueryClient();
  const [permission, setPermission] = useState<boolean | null>(null);

  const refreshPermission = useCallback(async () => {
    const granted = await PaymindCapture.hasPermission();
    setPermission(granted);
    return granted;
  }, []);

  useEffect(() => {
    void refreshPermission();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const syncNow = useCallback(async () => {
    const r = await syncCaptureNow();
    void qc.invalidateQueries({ queryKey: ['captured_txns'] });
    void qc.invalidateQueries({ queryKey: queryKeys.privacy });
    return r;
  }, [qc]);

  return {
    supported,
    permission,
    enabled: settings.data?.capture_notifications ?? false,
    loading: settings.isLoading,
    refreshPermission,
    syncNow,
  };
}
