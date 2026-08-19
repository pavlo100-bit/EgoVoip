import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keypad } from '../components/Keypad';
import { useSip } from '../hooks/useSip';
import { sipEngine } from '../sip/SipEngine';
import { ensureCallPermissions } from '../permissions/permissions';
import { colors, spacing } from '../theme/theme';
// TEMPORARY — outbound call setup timing investigation. Remove alongside
// src/sip/callTimingDiagnostics.ts once resolved.
import { markCallStart } from '../sip/callTimingDiagnostics';

interface Props {
  /** Prefilled when arriving from Contacts or History. */
  initialNumber?: string;
  onCallStarted: () => void;
}

export default function DialerScreen({ initialNumber = '', onCallStarted }: Props) {
  const [number, setNumber] = useState(initialNumber);
  const { registration, registrationError } = useSip();

  const append = useCallback(
    (d: string) => setNumber(prev => (prev.length >= 32 ? prev : prev + d)),
    [],
  );

  const placeCall = useCallback(async () => {
    if (!number.trim()) return;
    markCallStart(number);

    const { ok, blocked } = await ensureCallPermissions();
    if (!ok) {
      Alert.alert(
        'Microphone required',
        blocked
          ? 'Microphone access is blocked. Enable it in Settings › Apps › EgoVoip › Permissions.'
          : 'EgoVoip needs the microphone to place calls.',
      );
      return;
    }

    if (registration !== 'registered') {
      Alert.alert('Not connected', registrationError ?? 'Still connecting to the SIP server.');
      return;
    }

    try {
      sipEngine.call(number);
      onCallStarted();
    } catch (e) {
      Alert.alert('Call failed', e instanceof Error ? e.message : 'Unknown error');
    }
  }, [number, registration, registrationError, onCallStarted]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <RegistrationBanner />

      <View style={styles.display}>
        <Text
          style={styles.number}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}>
          {number}
        </Text>
      </View>

      <View style={styles.keypadWrap}>
        <Keypad onPress={append} onLongPressZero={() => append('+')} />
      </View>

      <View style={styles.actions}>
        <View style={styles.sideSlot}>
          {number.length > 0 ? (
            <Pressable
              accessibilityLabel="Delete last digit"
              onPress={() => setNumber(prev => prev.slice(0, -1))}
              onLongPress={() => setNumber('')}
              hitSlop={16}
              style={({ pressed }) => [styles.backspaceHit, pressed && styles.pressedSubtle]}>
              <Text style={styles.backspace}>⌫</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call"
          onPress={placeCall}
          style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}>
          <Text style={styles.callGlyph}>📞</Text>
        </Pressable>
        <View style={styles.sideSlot} />
      </View>
    </SafeAreaView>
  );
}

export function RegistrationBanner() {
  const { registration, registrationError } = useSip();
  if (registration === 'registered') return null;

  const failed = registration === 'failed';
  return (
    <View style={[styles.banner, failed && styles.bannerError]}>
      <Text style={styles.bannerText}>
        {failed
          ? registrationError ?? 'SIP registration failed'
          : 'Connecting to SIP server…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: {
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2),
    backgroundColor: colors.amber,
  },
  bannerError: { backgroundColor: colors.red },
  bannerText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  display: {
    minHeight: 110,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing(3),
    paddingBottom: spacing(3),
  },
  number: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '300',
    letterSpacing: 1.5,
    textAlign: 'center',
    // Phone numbers must always read left-to-right, even under Hebrew/RTL
    // locale — a dialed digit string is never RTL text.
    writingDirection: 'ltr',
  },
  keypadWrap: { alignItems: 'center' },
  actions: {
    flexDirection: 'row',
    direction: 'ltr', // call button stays centered, backspace stays on the right, regardless of locale
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing(4),
    paddingBottom: spacing(3),
  },
  sideSlot: { width: 96, alignItems: 'center' },
  callBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pressed: { opacity: 0.75 },
  pressedSubtle: { opacity: 0.5 },
  callGlyph: { fontSize: 34 },
  backspaceHit: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspace: { color: colors.textMuted, fontSize: 28 },
});
