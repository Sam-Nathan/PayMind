'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../lib/supabase/server';

export interface AuthState {
  error?: string;
  notice?: string;
}

function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/app') && !v.startsWith('//') ? v : '/app';
}

function cleanAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password do not match.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'An account with this email already exists. Try signing in.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first, then sign in.';
  if (m.includes('fetch failed') || m.includes('network'))
    return 'Could not reach the server. Check your connection and try again.';
  return message;
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: cleanAuthError(error.message) };
  } catch (e) {
    return { error: cleanAuthError(e instanceof Error ? e.message : 'Sign in failed') };
  }
  redirect(safeNext(formData.get('next')));
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!name) return { error: 'Enter your name.' };
  if (!email) return { error: 'Enter your email.' };
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };

  let hasSession = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: cleanAuthError(error.message) };
    hasSession = Boolean(data.session);
    if (hasSession && data.user) {
      // Best effort: the profile row is auto-created at sign-up; make sure the name is set.
      await supabase.from('profiles').update({ name }).eq('id', data.user.id);
    }
  } catch (e) {
    return { error: cleanAuthError(e instanceof Error ? e.message : 'Sign up failed') };
  }
  if (!hasSession) {
    return { notice: 'Check your email to confirm your account, then sign in.' };
  }
  redirect('/app');
}

export async function signOutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // ignore: cookies are cleared best-effort
  }
  redirect('/');
}
