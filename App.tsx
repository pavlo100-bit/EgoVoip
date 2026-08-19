import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/theme';
// TEMPORARY — see src/sip/permanentCredentialTest.ts. permanentCredentialTestEnabled
// is only ever true when src/config/permanentSipTest.local.ts has a password
// filled in locally; every normal build is completely unaffected.
import PermanentCredentialTestScreen from './src/screens/PermanentCredentialTestScreen';
import { permanentCredentialTestEnabled } from './src/sip/permanentCredentialTest';

export default function App() {
  if (permanentCredentialTestEnabled) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <PermanentCredentialTestScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
