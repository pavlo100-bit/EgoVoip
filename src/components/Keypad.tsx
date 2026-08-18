import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/theme';

const KEYS: { digit: string; letters?: string }[] = [
  { digit: '1' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*' },
  { digit: '0', letters: '+' },
  { digit: '#' },
];

interface Props {
  onPress: (digit: string) => void;
  /** Long-pressing 0 inserts "+" for E.164 dialling. */
  onLongPressZero?: () => void;
  compact?: boolean;
}

function KeypadBase({ onPress, onLongPressZero, compact }: Props) {
  return (
    <View style={styles.grid}>
      {KEYS.map(({ digit, letters }) => (
        <Pressable
          key={digit}
          accessibilityRole="button"
          accessibilityLabel={`Dial ${digit}`}
          onPress={() => onPress(digit)}
          onLongPress={digit === '0' ? onLongPressZero : undefined}
          style={({ pressed }) => [
            styles.key,
            compact && styles.keyCompact,
            pressed && styles.keyPressed,
          ]}>
          <Text style={[styles.digit, compact && styles.digitCompact]}>
            {digit}
          </Text>
          {letters ? <Text style={styles.letters}>{letters}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
    margin: spacing(1),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  keyCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
    margin: spacing(0.75),
  },
  keyPressed: { backgroundColor: colors.border },
  digit: { color: colors.text, fontSize: 30, fontWeight: '400' },
  digitCompact: { fontSize: 26 },
  letters: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 2,
  },
});

export const Keypad = memo(KeypadBase);
