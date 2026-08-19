import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keypad } from '../components/Keypad';
import { useCallDuration } from '../hooks/useCallDuration';
import { useSip } from '../hooks/useSip';
import { sipEngine } from '../sip/SipEngine';
import { colors, formatDuration, spacing } from '../theme/theme';
import type { CallStatus, CallView } from '../types';

interface Props {
  /** Push a second dialer on top of the call, for Add Call. */
  onAddCall: () => void;
}

function secondaryStatusLabel(status: CallStatus): string {
  switch (status) {
    case 'held':
      return 'בהמתנה';
    case 'active':
      return 'פעילה';
    case 'ringing':
      return 'מצלצלת';
    case 'connecting':
      return 'מתחברת';
    case 'ended':
      return 'הסתיימה';
  }
}

export default function ActiveCallScreen({ onAddCall }: Props) {
  const { calls, activeCallId, speakerOn, conference, conferenceSupported } = useSip();
  const { height } = useWindowDimensions();
  const [dtmfOpen, setDtmfOpen] = useState(false);
  const [dtmfBuffer, setDtmfBuffer] = useState('');

  const primary = useMemo<CallView | undefined>(
    () => calls.find(c => c.id === activeCallId) ?? calls[0],
    [calls, activeCallId],
  );
  const secondary = useMemo<CallView | undefined>(
    () => calls.find(c => c.id !== primary?.id),
    [calls, primary],
  );

  const elapsed = useCallDuration(primary?.answeredAt ?? null);

  const guard = useCallback((fn: () => void) => {
    try {
      fn();
    } catch (e) {
      Alert.alert('Call', e instanceof Error ? e.message : 'Action failed');
    }
  }, []);

  const onDtmf = useCallback(
    (digit: string) => {
      setDtmfBuffer(prev => (prev + digit).slice(-20));
      sipEngine.sendDTMF(digit);
    },
    [],
  );

  // The screen is only mounted while a call exists; this covers the frame
  // between the last call ending and the navigator unmounting us.
  if (!primary) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.status}>השיחה הסתיימה</Text>
        </View>
      </SafeAreaView>
    );
  }

  // conferenceSupported reflects whether this account's credentials include a
  // conferenceBridge (Phase 1: Zadarma's WebRTC-key path doesn't confirm one,
  // so this stays false and Merge stays visibly disabled rather than present
  // a button that always errors).
  const canMerge = calls.length === 2 && !conference && conferenceSupported;
  const statusLabel =
    primary.status === 'active'
      ? conference
        ? `ועידה · ${formatDuration(elapsed)}`
        : formatDuration(elapsed)
      : primary.status === 'ringing'
      ? primary.direction === 'outbound'
        ? 'מצלצל…'
        : 'שיחה נכנסת'
      : primary.status === 'held'
      ? 'בהמתנה'
      : 'מתקשר…';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {primary.remoteName}
        </Text>
        {primary.remoteName !== primary.remoteNumber ? (
          <Text style={styles.number}>{primary.remoteNumber}</Text>
        ) : null}
        <Text style={styles.status}>{statusLabel}</Text>

        {secondary ? (
          <Pressable style={styles.secondaryBar} onPress={() => sipEngine.swap()}>
            <Text style={styles.secondaryText} numberOfLines={1}>
              {secondary.remoteName} · {secondaryStatusLabel(secondary.status)}
            </Text>
            <Text style={styles.secondaryAction}>החלף</Text>
          </Pressable>
        ) : null}

        {dtmfOpen && dtmfBuffer ? (
          <Text style={styles.dtmfBuffer}>{dtmfBuffer}</Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        {dtmfOpen ? (
          <>
            <Keypad onPress={onDtmf} compact />
            <Pressable
              style={styles.hideKeypad}
              onPress={() => setDtmfOpen(false)}>
              <Text style={styles.hideKeypadText}>הסתר</Text>
            </Pressable>
          </>
        ) : (
          <View style={[styles.actionGrid, height < 700 && styles.actionGridTight]}>
            <ActionButton
              label={primary.muted ? 'בטל השתקה' : 'השתק'}
              glyph="🎙"
              active={primary.muted}
              onPress={() => sipEngine.toggleMute(primary.id)}
            />
            <ActionButton
              label="לוח מקשים"
              glyph="⌨"
              onPress={() => setDtmfOpen(true)}
            />
            <ActionButton
              label="רמקול"
              glyph="🔊"
              active={speakerOn}
              onPress={() => sipEngine.toggleSpeaker()}
            />

            <ActionButton
              label="הוסף שיחה"
              glyph="＋"
              disabled={calls.length >= 2}
              onPress={onAddCall}
            />
            <ActionButton
              label={primary.status === 'held' ? 'המשך' : 'השהה'}
              glyph="⏸"
              active={primary.status === 'held'}
              disabled={primary.status !== 'active' && primary.status !== 'held'}
              onPress={() =>
                primary.status === 'held'
                  ? sipEngine.unhold(primary.id)
                  : sipEngine.hold(primary.id)
              }
            />
            <ActionButton
              label="מזג שיחות"
              glyph="⇄"
              disabled={!canMerge}
              onPress={() => guard(() => sipEngine.merge())}
            />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="סיום שיחה"
          style={({ pressed }) => [styles.hangup, pressed && styles.hangupPressed]}
          onPress={() => sipEngine.hangup(primary.id)}>
          <Text style={styles.hangupGlyph}>✕</Text>
        </Pressable>
        <Text style={styles.hangupLabel}>סיום שיחה</Text>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  glyph,
  onPress,
  active,
  disabled,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.action}>
      <View
        style={[
          styles.actionCircle,
          active && styles.actionCircleActive,
          disabled && styles.actionCircleDisabled,
        ]}>
        <Text style={[styles.actionGlyph, active && styles.actionGlyphActive]}>
          {glyph}
        </Text>
      </View>
      <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: spacing(5),
    paddingHorizontal: spacing(3),
    alignItems: 'center',
  },
  name: { color: colors.text, fontSize: 30, fontWeight: '600' },
  // Phone numbers must always read left-to-right, even under Hebrew/RTL locale.
  number: { color: colors.textMuted, fontSize: 16, marginTop: spacing(0.5), writingDirection: 'ltr' },
  status: { color: colors.textMuted, fontSize: 16, marginTop: spacing(1.5) },
  secondaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: spacing(2.5),
    paddingVertical: spacing(1.25),
    paddingHorizontal: spacing(2),
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.textMuted, fontSize: 14, flex: 1 },
  secondaryAction: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dtmfBuffer: {
    color: colors.text,
    fontSize: 22,
    letterSpacing: 3,
    marginTop: spacing(2),
    writingDirection: 'ltr',
  },
  controls: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 320,
  },
  actionGridTight: { maxWidth: 300 },
  action: {
    width: 100,
    alignItems: 'center',
    marginVertical: spacing(1.5),
  },
  actionCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  actionCircleActive: { backgroundColor: colors.text },
  actionCircleDisabled: { opacity: 0.35 },
  actionGlyph: { fontSize: 26, color: colors.text },
  actionGlyphActive: { color: colors.bg },
  actionLabel: { color: colors.textMuted, fontSize: 13, marginTop: spacing(1), textAlign: 'center' },
  actionLabelDisabled: { opacity: 0.4 },
  hideKeypad: { marginTop: spacing(2), padding: spacing(1.5) },
  hideKeypadText: { color: colors.accent, fontSize: 16 },
  footer: { alignItems: 'center', paddingBottom: spacing(4) },
  hangup: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupPressed: { opacity: 0.75 },
  hangupGlyph: { color: '#fff', fontSize: 30, fontWeight: '600' },
  hangupLabel: { color: colors.textMuted, fontSize: 13, marginTop: spacing(1) },
});
