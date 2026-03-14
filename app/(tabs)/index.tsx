import { useState } from 'react';
import { TextInput, Button, StyleSheet, Alert } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const SERVER_URL = 'https://deep-dolls-sell.loca.lt';

export default function HomeScreen() {
  const [number, setNumber] = useState('');

  const makeCall = async () => {
    try {
      const response = await fetch(SERVER_URL);
      const text = await response.text();
      Alert.alert("Server response", text);
    } catch (e) {
      Alert.alert("Error", "Cannot reach server");
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">e-go Dialer</ThemedText>

      <TextInput
        style={styles.input}
        placeholder="Enter number"
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
    gap: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
});