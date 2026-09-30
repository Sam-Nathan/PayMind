/**
 * On-device speech recognition (expo-speech-recognition). It needs a development build: in Expo Go
 * the native module is missing, so every call here degrades to "not available" and the screen
 * falls back to typing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceLocale = 'en-IN' | 'hi-IN' | 'kn-IN';

export const VOICE_LOCALES: { value: VoiceLocale; label: string }[] = [
  { value: 'en-IN', label: 'English' },
  { value: 'hi-IN', label: 'हिन्दी' },
  { value: 'kn-IN', label: 'ಕನ್ನಡ' },
];

type SpeechModule = typeof import('expo-speech-recognition');

let cached: SpeechModule | null | undefined;

function load(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // A plain require so a missing native module (Expo Go, web) throws here and not at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-speech-recognition') as SpeechModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function isSpeechAvailable(): boolean {
  const m = load();
  if (!m) return false;
  try {
    return m.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export type SpeechProblem = 'permission' | 'no-speech' | 'unavailable' | 'other';

export interface SpeechState {
  available: boolean;
  listening: boolean;
  transcript: string;
  problem: SpeechProblem | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/**
 * `onFinal` is called once per session with the final transcript (possibly empty when nothing
 * was heard).
 */
export function useSpeech(locale: VoiceLocale, onFinal: (transcript: string) => void): SpeechState {
  const [available] = useState(() => isSpeechAvailable());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const latest = useRef('');
  const finalCb = useRef(onFinal);
  finalCb.current = onFinal;
  const active = useRef(false);

  useEffect(() => {
    const m = load();
    if (!m || !available) return;
    const mod = m.ExpoSpeechRecognitionModule;
    const subs = [
      mod.addListener('result', (e) => {
        const t = e.results[0]?.transcript ?? '';
        latest.current = t;
        setTranscript(t);
      }),
      mod.addListener('error', (e) => {
        if (e.error === 'aborted') return;
        setProblem(e.error === 'not-allowed' ? 'permission' : e.error === 'no-speech' ? 'no-speech' : 'other');
      }),
      mod.addListener('end', () => {
        setListening(false);
        if (active.current) {
          active.current = false;
          finalCb.current(latest.current.trim());
        }
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      try {
        mod.abort();
      } catch {
        // nothing running
      }
    };
  }, [available]);

  const start = useCallback(async () => {
    const m = load();
    if (!m || !available) {
      setProblem('unavailable');
      return;
    }
    const mod = m.ExpoSpeechRecognitionModule;
    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) {
      setProblem('permission');
      return;
    }
    latest.current = '';
    setTranscript('');
    setProblem(null);
    active.current = true;
    setListening(true);
    mod.start({ lang: locale, interimResults: true, continuous: false, maxAlternatives: 1 });
  }, [available, locale]);

  const stop = useCallback(() => {
    const m = load();
    if (!m) return;
    try {
      m.ExpoSpeechRecognitionModule.stop();
    } catch {
      // not running
    }
  }, []);

  const reset = useCallback(() => {
    latest.current = '';
    setTranscript('');
    setProblem(null);
  }, []);

  return { available, listening, transcript, problem, start, stop, reset };
}
