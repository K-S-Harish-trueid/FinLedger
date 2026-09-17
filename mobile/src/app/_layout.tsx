import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UpdateGate } from '@/components/UpdateGate';
import { FinLedgerProvider, useFinLedger } from '@/lib/store';
import { palette } from '@/lib/theme';

const RootNavigator = (): React.JSX.Element => {
  const { status } = useFinLedger();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator color={palette.brand} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
};

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <FinLedgerProvider>
        <StatusBar style="dark" />
        <RootNavigator />
        <UpdateGate />
      </FinLedgerProvider>
    </SafeAreaProvider>
  );
}
