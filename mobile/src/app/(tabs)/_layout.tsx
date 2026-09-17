import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useFinLedger } from '@/lib/store';
import { palette } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }): React.JSX.Element => (
    <Ionicons name={name} color={color as string} size={size} />
  );

export default function TabsLayout(): React.JSX.Element {
  const { status } = useFinLedger();
  if (status === 'signedOut') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.brand,
        tabBarInactiveTintColor: palette.faint,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="savings" options={{ title: 'Saved', tabBarIcon: icon('trending-up') }} />
      <Tabs.Screen name="leaks" options={{ title: 'Leaks', tabBarIcon: icon('trending-down') }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="reports" options={{ title: 'Report', tabBarIcon: icon('bar-chart') }} />
    </Tabs>
  );
}
