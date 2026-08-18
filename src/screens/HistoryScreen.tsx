import React, { useSyncExternalStore } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callHistory } from '../storage/callHistory';
import { colors, formatDuration, spacing } from '../theme/theme';
import type { CallLogEntry } from '../types';

interface Props {
  onSelectNumber: (number: string) => void;
}

const GLYPH: Record<CallLogEntry['outcome'], string> = {
  incoming: '↙',
  outgoing: '↗',
  missed: '↙',
};

export default function HistoryScreen({ onSelectNumber }: Props) {
  const entries = useSyncExternalStore(
    callHistory.subscribe,
    callHistory.getSnapshot,
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Recents</Text>
        {entries.length > 0 ? (
          <Pressable onPress={() => callHistory.clear()} hitSlop={10}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={entries}
        keyExtractor={e => e.id}
        ListEmptyComponent={<Text style={styles.empty}>No recent calls</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`Call ${item.name || item.number} back`}
            onPress={() => onSelectNumber(item.number)}>
            <Text
              style={[styles.glyph, item.outcome === 'missed' && styles.missed]}>
              {GLYPH[item.outcome]}
            </Text>
            <View style={styles.body}>
              <Text
                style={[styles.name, item.outcome === 'missed' && styles.missed]}
                numberOfLines={1}>
                {item.name || item.number}
              </Text>
              <Text style={styles.meta}>
                {formatTimestamp(item.startedAt)}
                {item.durationSec > 0
                  ? ` · ${formatDuration(item.durationSec)}`
                  : item.outcome === 'missed'
                  ? ' · missed'
                  : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} ${time}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  clear: { color: colors.accent, fontSize: 15 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing(5) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  glyph: {
    color: colors.textMuted,
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  missed: { color: colors.red },
  body: { flex: 1, marginLeft: spacing(1) },
  name: { color: colors.text, fontSize: 16, fontWeight: '500' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
