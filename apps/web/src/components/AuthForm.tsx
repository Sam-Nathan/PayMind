'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signInAction, signUpAction, type AuthState } from '../app/auth-actions';
import { SubmitButton } from './SubmitButton';
import { ErrorNote } from './ui';

export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    mode === 'login' ? signInAction : signUpAction,
    {},
  );
  const isLogin = mode === 'login';

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="dots rounded-[28px] bg-hero px-6 py-8 text-text-on-dark">
        <Link href="/" className="text-[15px] font-bold tracking-tight">
          PayMind
        </Link>
        <h1 className="mt-6 text-[28px] font-bold leading-tight">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1 text-[14px] text-text-on-dark-muted">
          {isLogin
            ? 'Sign in to see who owes what.'
            : 'Split bills, settle up and stay on top of shared money.'}
        </p>
      </div>

      <form action={formAction} className="card mt-4 space-y-4 !p-5">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {!isLogin ? (
          <div>
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" name="name" autoComplete="name" required className="field" />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={isLogin ? undefined : 8}
            required
            className="field"
          />
          {!isLogin ? <p className="mt-1 text-[12px] text-text-muted">At least 8 characters.</p> : null}
        </div>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.notice ? (
          <p role="status" className="rounded-[14px] bg-mist px-3.5 py-2.5 text-[14px] font-medium">
            {state.notice}
          </p>
        ) : null}

        <SubmitButton className="btn-primary w-full" pendingText={isLogin ? 'Signing in…' : 'Creating…'}>
          {isLogin ? 'Sign in' : 'Create account'}
        </SubmitButton>

        <p className="text-center text-[14px] text-text-muted">
          {isLogin ? (
            <>
              New to PayMind?{' '}
              <Link href="/signup" className="font-semibold text-signal">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-signal">
                Sign in
              </Link>
            </>
          )}
        </p>
        {!isLogin ? (
          <p className="text-center text-[12px] text-text-muted">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}
      </form>
    </div>
  );
}
