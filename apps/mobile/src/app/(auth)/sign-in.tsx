import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AuthShell, Button, ErrorNote, TextField } from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { supabase } from '../../lib/supabase.ts';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(friendlyError(err));
    // On success AuthProvider updates the session and the root layout swaps to (tabs).
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see who owes what.">
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button label="Sign in" size="lg" loading={busy} onPress={submit} />
      <View className="flex-row justify-center gap-1">
        <Text className="font-sans text-[15px] text-muted">New to PayMind?</Text>
        <Link href="/sign-up" className="font-sans-semibold text-[15px] text-signal">
          Create an account
        </Link>
      </View>
      <Text className="font-sans text-center text-[12px] text-muted">
        Phone OTP, Google and Apple sign-in are coming soon.
      </Text>
    </AuthShell>
  );
}
