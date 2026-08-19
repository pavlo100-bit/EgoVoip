import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useSip } from '../hooks/useSip';
import DialerScreen from '../screens/DialerScreen';
import ContactsScreen from '../screens/ContactsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import LoginScreen from '../screens/LoginScreen';
import ActiveCallScreen from '../screens/ActiveCallScreen';
import IncomingCallScreen from '../screens/IncomingCallScreen';
import { colors } from '../theme/theme';

export type TabParamList = {
  Recents: undefined;
  Dialer: { number?: string } | undefined;
  Contacts: undefined;
};

type Nav = BottomTabNavigationProp<TabParamList>;

const Tab = createBottomTabNavigator<TabParamList>();

export default function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (status === 'signedOut') return <LoginScreen />;

  return <SignedInApp />;
}

function SignedInApp() {
  const { calls } = useSip();
  // Add Call pushes a dialer on top of the live call.
  const [addingCall, setAddingCall] = useState(false);

  const incoming = useMemo(
    () => calls.find(c => c.direction === 'inbound' && c.status === 'ringing'),
    [calls],
  );

  // A ringing inbound call takes the whole screen — but only when it is the
  // sole call. A second call arriving mid-conversation stays inside the call UI
  // as a waiting leg rather than hijacking everything.
  if (incoming && calls.length === 1) {
    return <IncomingCallScreen call={incoming} />;
  }

  if (calls.length > 0) {
    return addingCall ? (
      <AddCallDialer onClose={() => setAddingCall(false)} />
    ) : (
      <ActiveCallScreen onAddCall={() => setAddingCall(true)} />
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator initialRouteName="Dialer" screenOptions={screenOptions}>
        <Tab.Screen
          name="Recents"
          component={RecentsTab}
          options={{ tabBarLabel: 'אחרונות', tabBarIcon: RecentsIcon }}
        />
        <Tab.Screen
          name="Dialer"
          component={DialerTab}
          options={{ tabBarLabel: 'חייגן', tabBarIcon: DialerIcon }}
        />
        <Tab.Screen
          name="Contacts"
          component={ContactsTab}
          options={{ tabBarLabel: 'אנשי קשר', tabBarIcon: ContactsIcon }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ----------------------------------------------------------------- tab screens

function RecentsTab() {
  const navigation = useNavigation<Nav>();
  return (
    <HistoryScreen
      onSelectNumber={n => navigation.navigate('Dialer', { number: n })}
    />
  );
}

function ContactsTab() {
  const navigation = useNavigation<Nav>();
  return (
    <ContactsScreen
      onSelectNumber={n => navigation.navigate('Dialer', { number: n })}
    />
  );
}

function DialerTab() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<TabParamList, 'Dialer'>>();
  const prefill = route.params?.number;

  return (
    // Remounting on a new prefill is the simplest correct way to reset the
    // dialer's internal digit buffer.
    <DialerScreen
      key={prefill ?? 'blank'}
      initialNumber={prefill ?? ''}
      onCallStarted={() => navigation.setParams({ number: undefined })}
    />
  );
}

function AddCallDialer({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.fill}>
      <DialerScreen onCallStarted={onClose} />
      <Pressable style={styles.cancelBar} onPress={onClose}>
        <Text style={styles.cancelText}>Back to call</Text>
      </Pressable>
    </View>
  );
}

// ------------------------------------------------------------------- chrome

const RecentsIcon = () => <TabGlyph glyph="🕘" />;
const DialerIcon = () => <TabGlyph glyph="⌨" />;
const ContactsIcon = () => <TabGlyph glyph="👤" />;

function TabGlyph({ glyph }: { glyph: string }) {
  return <Text style={styles.tabGlyph}>{glyph}</Text>;
}

const screenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
} as const;

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1, backgroundColor: colors.bg },
  cancelBar: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.accent, fontSize: 16 },
  tabGlyph: { fontSize: 20 },
});
