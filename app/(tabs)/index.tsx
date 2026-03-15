import { useState } from 'react';
import { TextInput, Button, StyleSheet, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

const SERVER_URL = 'https://egovoip-production.up.railway.app';

export default function HomeScreen() {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizePhoneNumber = (value: string) => {
    return value.replace(/[^\d+]/g, '').trim();
  };

  const makeCall = async () => {
    const cleanNumber = normalizePhoneNumber(number);

    if (!cleanNumber) {
      Alert.alert('שגיאה', 'נא להזין מספר לחיוג');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: cleanNumber }),
      });

      const text = await response.text();

      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!response.ok) {
        Alert.alert(
          'שגיאת שרת',
          data.message || 'השרת החזיר שגיאה'
        );
        return;
      }

      Alert.alert(
        '✅ בוצע',
        data.message || `המספר ${cleanNumber} נשלח לשרת`
      );
    } catch (error) {
      Alert.alert('שגיאת חיבור', 'לא ניתן להגיע לשרת');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">e-go Dialer</ThemedText>

      <TextInput
        style={styles.input}
        placeholder="הכנס מספר לחיוג"
        keyboardType="phone-pad"
        value={number}
        onChangeText={setNumber}
        editable={!loading}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Button
        title={loading ? 'שולח...' : 'Call'}
        onPress={makeCall}
        disabled={loading}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
});