import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sipEngine } from '../sip/SipEngine';
import { ensureCallPermissions } from '../permissions/permissions';
import { colors, spacing } from '../theme/theme';
import type { CallView } from '../types';

export default function IncomingCallScreen({ call }: { call: CallView }) {
  const accept = useCallback(async () => {
    // The mic prompt can only appear once the app is foregrounded, so a call
    // answered from a cold start still has to pass through here.
    const { ok } = await ensureCallPermissions();
    if (!ok) {
      Alert.alert('Microphone required', 'EgoVoip cannot answer without the microphone.');
      sipEngine.reject(call.id);
      return;
    }
    sipEngine.answer(call.id);
  }, [call.id]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.info}>
        <Text style={styles.label}>Incoming call</Text>
        <Text style={styles.name} numberOfLines={1}>
          {call.remoteName}
        </Text>
        {call.remoteName !== call.remoteNumber ? (
          <Text style={styles.number}>{call.remoteNumber}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Action
          label="Decline"
          glyph="✕"
          color={colors.red}
          onPress={() => sipEngine.reject(call.id)}
        />
        <Action label="Accept" glyph="📞" color={colors.green} onPress={accept} />
      </View>
    </SafeAreaView>
  );
}

function Action({
  label,
  glyph,
  color,
  onPress,
}: {
  label: string;
  glyph: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.actionWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.circle,
          { backgroundColor: color },
          pressed && styles.pressed,
        ]}>
        <Text style={styles.glyph}>{glyph}</Text>
      </Pressable>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'space-between',
  },
  info: { alignItems: 'center', marginTop: spacing(10) },
  label: { color: colors.textMuted, fontSize: 16, letterSpacing: 1 },
  name: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
    marginTop: spacing(1.5),
  },
  number: { color: colors.textMuted, fontSize: 17, marginTop: spacing(0.5) },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingBottom: spacing(6),
  },
  actionWrap: { alignItems: 'center' },
  circle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
  glyph: { fontSize: 30, color: '#fff' },
  actionLabel: { color: colors.textMuted, marginTop: spacing(1), fontSize: 14 },
});
