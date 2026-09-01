import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Home, Users, CreditCard, Settings, Bell } from 'lucide-react-native';
import { useTheme } from '@/lib/use-theme';

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
        name="team"
        options={{ title: t('tabs.team'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="billing"
        options={{ title: t('tabs.billing'), tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: t('tabs.notifications'), tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  );
}
