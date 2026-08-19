/**
 * TEMPORARY — see src/sip/permanentCredentialTest.ts. Only ever rendered
 * when src/config/permanentSipTest.local.ts has a password filled in; every
 * normal build (the default state) never reaches this screen at all.
 */
import React, { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSip } from '../hooks/useSip';
import { startPermanentCredentialTest } from '../sip/permanentCredentialTest';
import { colors, spacing } from '../theme/theme';

export default function PermanentCredentialTestScreen() {
  const { registration, registrationError } = useSip();

  useEffect(() => {
    // TEMPORARY — mount/unmount tracking for the "why does REGISTER drop
    // after ~7s" investigation. If 'unmounted' ever prints, the component
    // was torn down (Fast Refresh remount, or App.tsx re-rendered this
    // branch away) — ruling that in or out of the disconnect's cause.
    console.log('[sip-diag] PermanentCredentialTestScreen mounted');
    startPermanentCredentialTest();

    return () => {
      console.log('[sip-diag] PermanentCredentialTestScreen UNMOUNTED');
    };
  }, []);

  useEffect(() => {
    // TEMPORARY — same investigation. Confirms/rules out Android
    // backgrounding (Doze, App Standby) as the disconnect trigger.
    const sub = AppState.addEventListener('change', state => {
      console.log('[sip-diag] AppState changed to', state);
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.title}>Permanent-credential REGISTER test</Text>
        <Text style={styles.status}>registration: {registration}</Text>
        {registrationError ? (
          <Text style={styles.error}>{registrationError}</Text>
        ) : null}
        <Text style={styles.hint}>Full detail is in adb logcat — filter for [sip-diag].</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, justifyContent: 'center', padding: spacing(3) },
  title: { color: colors.text, fontSize: 20, fontWeight: '600', marginBottom: spacing(2) },
  status: { color: colors.text, fontSize: 16, marginBottom: spacing(1) },
  error: { color: colors.red, fontSize: 14, marginBottom: spacing(1) },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: spacing(3) },
});
