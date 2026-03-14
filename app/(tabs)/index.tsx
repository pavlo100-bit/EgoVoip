import { useState } from 'react';
import { TextInput, Button, StyleSheet, Alert } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const SERVER_URL = 'https://egovoip-production.up.railway.app';

export default function HomeScreen() {
  const [number, setNumber] = useState('');

  const makeCall = async () => {
    if (!number.trim()) {
      Alert.alert('שגיאה', 'נא להזין מספר לחיוג');
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/health`);
      const data = await response.json();

      Alert.alert('השרת ענה', data.message);
    } catch (e) {
      Alert.alert('שגיאת חיבור', 'לא ניתן להגיע לשרת');
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
      />

      <Button title="Call" onPress={makeCall} />
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