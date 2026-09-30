import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AuthShell, Button, ErrorNote, StatusBox, TextField } from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { supabase } from '../../lib/supabase.ts';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() || undefined } },
    });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else if (!data.session) setConfirmSent(true); // email confirmation is on: no session yet
  };

  return (
    <AuthShell title="Create your account" subtitle="Split, settle and stay on top of your money.">
      <TextField label="Your name" value={name} onChangeText={setName} placeholder="Sunny" autoComplete="name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 6 characters"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? <ErrorNote message={error} /> : null}
      {confirmSent ? <StatusBox>Check your inbox to confirm your email, then sign in.</StatusBox> : null}
      <Button label="Create account" size="lg" loading={busy} onPress={submit} />
      <View className="flex-row justify-center gap-1">
        <Text className="font-sans text-[15px] text-muted">Already have an account?</Text>
        <Link href="/sign-in" className="font-sans-semibold text-[15px] text-signal">
          Sign in
        </Link>
      </View>
    </AuthShell>
  );
}
