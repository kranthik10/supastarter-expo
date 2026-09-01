import '../lib/i18n';
import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useSettings } from '@/lib/settings-store';
import { useAuth } from '@repo/auth';
import { useOrgs } from '@repo/organizations';
import { useBilling } from '@repo/billing';
import { changeLanguage } from '@/lib/i18n';
import { useDeepLinks, storePendingLink } from '@/lib/linking';
import { addNotificationResponseListener, getLastNotificationData, type SafeNotificationData } from '@repo/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

void SplashScreen.preventAutoHideAsync().catch(() => {});
const queryClient = new QueryClient();

export default function RootLayout() {
  const hydrated = useAuth((s) => s.hydrated);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const isDark = useSettings((s) => s.isDark);
  const locale = useSettings((s) => s.locale);

  const hydrateAuth = useAuth((s) => s.hydrate);
  const hydrateOrgs = useOrgs((s) => s.hydrate);
  const hydrateBilling = useBilling((s) => s.hydrate);
  const hydrateSettings = useSettings((s) => s.hydrate);

  useDeepLinks();

  useEffect(() => {
    if (!hydrated || !settingsHydrated) return;
    const handleNotification = (data: SafeNotificationData) => {
      if (!data.route) return;
      if (!useAuth.getState().user) {
        void storePendingLink(data.route);
        (router.replace as unknown as (path: string) => void)('/sign-in');
        return;
      }
      (router.push as unknown as (path: string) => void)(data.route);
    };
    const sub = addNotificationResponseListener(handleNotification);
    void getLastNotificationData().then((data) => {
      if (data) handleNotification(data);
    });
    return () => sub.remove();
  }, [hydrated, settingsHydrated]);

  useEffect(() => {
    void Promise.all([hydrateAuth(), hydrateOrgs(), hydrateBilling(), hydrateSettings()]);
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      useSettings.getState().setSystemDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, [hydrateAuth, hydrateOrgs, hydrateBilling, hydrateSettings]);

  useEffect(() => {
    void changeLanguage(locale);
  }, [locale]);

  useEffect(() => {
    if (settingsHydrated && hydrated) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [settingsHydrated, hydrated]);

  if (!hydrated || !settingsHydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(marketing)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding/index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </QueryClientProvider>
  );
}

