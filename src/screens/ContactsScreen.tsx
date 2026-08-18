import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Contacts from 'react-native-contacts';
import { ensureContactsPermission } from '../permissions/permissions';
import { colors, spacing } from '../theme/theme';
import type { DeviceContact } from '../types';

interface Props {
  onSelectNumber: (number: string) => void;
}

type LoadState = 'loading' | 'ready' | 'denied' | 'error';

export default function ContactsScreen({ onSelectNumber }: Props) {
  const [state, setState] = useState<LoadState>('loading');
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    if (!(await ensureContactsPermission())) {
      setState('denied');
      return;
    }
    try {
      const raw = await Contacts.getAll();
      const mapped: DeviceContact[] = raw
        .map(c => ({
          id: c.recordID,
          name:
            [c.givenName, c.familyName].filter(Boolean).join(' ').trim() ||
            c.displayName ||
            c.company ||
            'No name',
          numbers: (c.phoneNumbers ?? []).map(p => ({
            label: p.label ?? 'phone',
            number: p.number ?? '',
          })).filter(p => p.number),
        }))
        // A contact with no number is not dialable — leave it out entirely.
        .filter(c => c.numbers.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

      setContacts(mapped);
      setState('ready');
    } catch (e) {
      console.warn('[contacts] load failed', e);
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/\D/g, '');
    return contacts.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (digits.length > 0 &&
          c.numbers.some(n => n.number.replace(/\D/g, '').includes(digits))),
    );
  }, [contacts, query]);

  if (state !== 'ready') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          {state === 'loading' ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Text style={styles.message}>
                {state === 'denied'
                  ? 'Contacts permission is off. Enable it in Settings to dial from your address book.'
                  : 'Could not read contacts.'}
              </Text>
              <Pressable style={styles.retry} onPress={load}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TextInput
        style={styles.search}
        placeholder="Search contacts"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>No matching contacts</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.numbers.map((n, i) => (
                <Pressable
                  key={`${item.id}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${item.name} at ${n.number}`}
                  onPress={() => onSelectNumber(n.number)}>
                  <Text style={styles.rowNumber}>
                    {n.number}
                    <Text style={styles.rowLabel}>  {n.label}</Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
  },
  message: { color: colors.textMuted, textAlign: 'center', fontSize: 15 },
  retry: { marginTop: spacing(2), padding: spacing(1.5) },
  retryText: { color: colors.accent, fontSize: 16 },
  search: {
    margin: spacing(2),
    paddingHorizontal: spacing(2),
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(4),
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(2),
  },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: '600' },
  rowBody: { flex: 1 },
  rowName: { color: colors.text, fontSize: 16, fontWeight: '500' },
  rowNumber: { color: colors.accent, fontSize: 14, marginTop: 2 },
  rowLabel: { color: colors.textMuted, fontSize: 12 },
});
