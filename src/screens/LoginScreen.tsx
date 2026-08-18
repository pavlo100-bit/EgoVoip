import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/theme';

export default function LoginScreen() {
  const { signIn, error, busy } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = useCallback(() => {
    if (!username.trim() || !password) return;
    // AuthContext surfaces the failure through `error`; swallow the rejection.
    signIn(username.trim(), password).catch(() => {});
  }, [signIn, username, password]);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <Text style={styles.title}>EgoVoip</Text>
          <Text style={styles.subtitle}>Sign in with your account</Text>

          <TextInput
            style={styles.input}
            placeholder="Username or email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (busy || !username.trim() || !password) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
            disabled={busy || !username.trim() || !password}
            onPress={submit}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <Text style={styles.note}>
            Your SIP extension is provisioned automatically after sign-in.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: spacing(3) },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(1),
    marginBottom: spacing(4),
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: spacing(2),
    backgroundColor: colors.surface,
    color: colors.text,
    marginBottom: spacing(1.5),
    fontSize: 16,
  },
  error: { color: colors.red, marginBottom: spacing(1.5), fontSize: 14 },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing(1),
  },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing(3),
  },
});
