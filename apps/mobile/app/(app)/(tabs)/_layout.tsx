import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Heart, Home, Bell, User } from 'lucide-react-native';
import { useTheme } from '@/lib/use-theme';

// ServiceHub product shell: customer-first tabs. Starter screens
// (team, billing, notes, settings) stay mounted with href: null —
// reachable from the Account workspace section, but no longer tabs.
// Removal recipe (docs/phase-6-product-configuration.md): delete the
// marketplace routes + this layout's marketplace tabs to restore a
// starter-only shell.
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: t('tabs.home'), tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: t('tabs.bookings'), tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: t('tabs.favorites'), tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: t('tabs.notifications'), tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('tabs.account'), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
      <Tabs.Screen name="team" options={{ href: null }} />
      <Tabs.Screen name="billing" options={{ href: null }} />
      <Tabs.Screen name="notes" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
