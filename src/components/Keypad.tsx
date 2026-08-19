import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors } from '../theme/theme';
import { playKeypadTone } from '../native/dtmfTone';

interface Key {
  digit: string;
  letters?: string;
}

/**
 * Fixed row layout, never derived from a flex-wrap of a flat list. A single
 * flex-wrapped row of 12 keys has no guaranteed column count — it depends on
 * exact pixel math between key width and container width, and under RTL
 * locales (Hebrew) React Native also auto-mirrors `flexDirection: 'row'`
 * unless explicitly overridden. Explicit rows + `direction: 'ltr'` on each
 * row (below) make the standard phone-dialer order (1 2 3 / 4 5 6 / 7 8 9 /
 * * 0 #) unconditional, regardless of screen width or system language.
 */
const ROWS: Key[][] = [
  [{ digit: '1' }, { digit: '2', letters: 'ABC' }, { digit: '3', letters: 'DEF' }],
  [{ digit: '4', letters: 'GHI' }, { digit: '5', letters: 'JKL' }, { digit: '6', letters: 'MNO' }],
  [{ digit: '7', letters: 'PQRS' }, { digit: '8', letters: 'TUV' }, { digit: '9', letters: 'WXYZ' }],
  [{ digit: '*' }, { digit: '0', letters: '+' }, { digit: '#' }],
];

interface Props {
  onPress: (digit: string) => void;
  /** Long-pressing 0 inserts "+" for E.164 dialling. */
  onLongPressZero?: () => void;
  compact?: boolean;
}

function KeypadBase({ onPress, onLongPressZero, compact }: Props) {
  const { width } = useWindowDimensions();

  // Local key-press feedback tone only — separate from whatever `onPress`
  // does (append a digit locally, or send real SIP DTMF in-call). Fires
  // immediately and never blocks/delays the actual press handling below.
  const handlePress = useCallback(
    (digit: string) => {
      playKeypadTone(digit);
      onPress(digit);
    },
    [onPress],
  );

  // Responsive sizing: 3 keys per row with generous gaps, clamped so it
  // stays large on a normal phone width without overflowing a small one.
  const gap = compact ? 16 : 20;
  const horizontalPadding = compact ? 32 : 24;
  const available = width - horizontalPadding * 2 - gap * 2;
  const rawSize = Math.floor(available / 3);
  const keySize = compact
    ? Math.min(78, Math.max(60, rawSize))
    : Math.min(96, Math.max(80, rawSize));
  const digitSize = compact ? Math.round(keySize * 0.4) : Math.round(keySize * 0.42);

  return (
    <View style={styles.grid}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, { marginBottom: rowIndex < ROWS.length - 1 ? gap : 0 }]}>
          {row.map(({ digit, letters }, i) => (
            <Pressable
              key={digit}
              accessibilityRole="button"
              accessibilityLabel={`Dial ${digit}`}
              onPress={() => handlePress(digit)}
              onLongPress={digit === '0' ? onLongPressZero : undefined}
              style={({ pressed }) => [
                styles.key,
                {
                  width: keySize,
                  height: keySize,
                  borderRadius: keySize / 2,
                  marginRight: i < row.length - 1 ? gap : 0,
                },
                pressed && styles.keyPressed,
              ]}>
              <Text style={[styles.digit, { fontSize: digitSize }]}>{digit}</Text>
              {letters ? <Text style={styles.letters}>{letters}</Text> : null}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { alignItems: 'center' },
  row: {
    flexDirection: 'row',
    direction: 'ltr', // keypad order is always 1-2-3 left-to-right, never mirrored by RTL locales
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  keyPressed: { backgroundColor: colors.border },
  digit: { color: colors.text, fontWeight: '400' },
  letters: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 2,
  },
});

export const Keypad = memo(KeypadBase);
