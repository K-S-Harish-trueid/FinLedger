import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Field, Input, Screen } from '@/components/ui';
import { useFinLedger } from '@/lib/store';
import { ApiError } from '@/lib/api';
import { palette, spacing } from '@/lib/theme';

const messageFor = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Cannot reach the server. Check the API address and your connection.';
    if (error.message === 'invalid_credentials') return 'That email and password do not match.';
    if (error.message === 'email_taken') return 'An account already exists for that email.';
    if (error.message === 'invalid_body') return 'Check your details. Passwords need at least 8 characters.';
  }
  return 'Something went wrong. Please try again.';
};

export default function LoginScreen(): React.JSX.Element {
  const { status, signIn, signUp } = useFinLedger();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'ready') return <Redirect href="/(tabs)" />;

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else await signUp(name.trim(), email.trim(), password);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.brand}>
          <Text style={styles.brandMark}>FinLedger</Text>
          <Text style={styles.tagline}>
            Track what you save, not just what you spend. Every rupee you avoid spending counts toward the month.
          </Text>
        </View>

        <View style={styles.form}>
          {mode === 'signUp' ? (
            <Field label="Your name">
              <Input value={name} onChangeText={setName} placeholder="Harish" autoCapitalize="words" />
            </Field>
          ) : null}

          <Field label="Email">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
            />
          </Field>

          <Field label="Password" hint={mode === 'signUp' ? 'At least 8 characters.' : undefined}>
            <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          </Field>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={mode === 'signIn' ? 'Sign in' : 'Create account'}
            onPress={() => void submit()}
            loading={busy}
            disabled={!email || !password || (mode === 'signUp' && !name)}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}>
            <Text style={styles.switch}>
              {mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxl, paddingTop: spacing.xxl },
  brand: { gap: spacing.sm },
  brandMark: { fontSize: 34, fontWeight: '800', color: palette.brand, letterSpacing: -1 },
  tagline: { fontSize: 15, color: palette.muted, lineHeight: 22 },
  form: { gap: spacing.lg },
  error: { color: palette.loss, fontSize: 13.5, lineHeight: 19 },
  switch: { color: palette.brand, fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
