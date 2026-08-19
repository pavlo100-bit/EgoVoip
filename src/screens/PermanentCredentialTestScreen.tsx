/**
 * TEMPORARY — see src/sip/permanentCredentialTest.ts. Only ever rendered
 * when src/config/permanentSipTest.local.ts has a password filled in; every
 * normal build (the default state) never reaches this screen at all.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSip } from '../hooks/useSip';
import { startPermanentCredentialTest } from '../sip/permanentCredentialTest';
import { colors, spacing } from '../theme/theme';

export default function PermanentCredentialTestScreen() {
  const { registration, registrationError } = useSip();

  useEffect(() => {
    startPermanentCredentialTest();
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
