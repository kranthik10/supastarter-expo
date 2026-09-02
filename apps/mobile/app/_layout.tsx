import '../lib/i18n';
import React, { useEffect, useRef } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { Appearance, Platform, StyleSheet, View } from 'react-native';
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
import { createClientMonitoring, installClientErrorHandlers, MonitoringErrorBoundary } from '@repo/monitoring/client';
import { Text, Button } from '@repo/ui';
import { analytics, configureAnalytics, screenNameForPath, setAnalyticsEnabled } from '@repo/analytics';
import { config } from '@repo/config';
import Constants from 'expo-constants';
import { trpc } from '@repo/api';

void SplashScreen.preventAutoHideAsync().catch(() => {});
const queryClient = new QueryClient();
const clientMonitoring = createClientMonitoring({
  dsn: config.sentryDsn,
  release: `${config.appSlug}@${Constants.expoConfig?.version ?? '1.0.0'}`,
  environment: config.appVariant,
  platform: Platform.OS,
});
configureAnalytics({ apiKey: config.posthogKey, host: config.posthogHost });

export default function RootLayout() {
  const hydrated = useAuth((s) => s.hydrated);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const isDark = useSettings((s) => s.isDark);
  const locale = useSettings((s) => s.locale);
  const user = useAuth((s) => s.user);
  const activeOrgId = useOrgs((s) => s.activeOrgId);
  const pathname = usePathname();
  const previousUserId = useRef<string | null>(null);
  const analyticsOrgId = useRef<string | null>(null);

  const hydrateAuth = useAuth((s) => s.hydrate);
  const hydrateOrgs = useOrgs((s) => s.hydrate);
  const hydrateBilling = useBilling((s) => s.hydrate);
  const hydrateSettings = useSettings((s) => s.hydrate);

  useDeepLinks();

  useEffect(() => installClientErrorHandlers(clientMonitoring), []);

  useEffect(() => {
    if (!hydrated) return;
    clientMonitoring.setUserContext(user?.id ?? null);
    if (!user) clientMonitoring.setOrganizationContext(null);
  }, [hydrated, user?.id]);

  useEffect(() => {
    if (!user || !activeOrgId) {
      clientMonitoring.setOrganizationContext(null);
      return;
    }
    clientMonitoring.setOrganizationContext({ organizationId: activeOrgId });
  }, [activeOrgId, user?.id]);

  useEffect(() => {
    clientMonitoring.setRoute(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      if (previousUserId.current) analytics.capture('user_signed_out', {});
      analytics.reset();
      setAnalyticsEnabled(false);
      previousUserId.current = null;
      analyticsOrgId.current = null;
      return;
    }
    if (previousUserId.current === user.id) return;
    previousUserId.current = user.id;
    analyticsOrgId.current = null;
    setAnalyticsEnabled(false);
    let active = true;
    void trpc.settings.getPreferences.query().then((preferences) => {
      if (!active) return;
      setAnalyticsEnabled(preferences.analyticsEnabled);
      if (!preferences.analyticsEnabled) return;
      const currentLocale = useSettings.getState().locale;
      analytics.identify(user.id, { locale: currentLocale, theme: preferences.theme });
      const authEvent = useAuth.getState().consumeAuthEvent() ?? 'signed_in';
      analytics.capture(authEvent === 'signed_up' ? 'user_signed_up' : 'user_signed_in', { method: 'unknown' });
      analytics.screen(screenNameForPath(pathname));
      const currentOrgId = useOrgs.getState().activeOrgId;
      if (currentOrgId) {
        analytics.group('organization', currentOrgId);
        analyticsOrgId.current = currentOrgId;
      }
    }).catch(() => {
      if (active) setAnalyticsEnabled(false);
    });
    return () => {
      active = false;
    };
  }, [hydrated, pathname, user?.id]);

  useEffect(() => {
    if (!hydrated || !user || !analytics.isEnabled()) return;
    analytics.screen(screenNameForPath(pathname));
  }, [hydrated, pathname, user?.id]);

  useEffect(() => {
    if (!user || !activeOrgId || !analytics.isEnabled() || analyticsOrgId.current === activeOrgId) return;
    if (analyticsOrgId.current) analytics.capture('organization_switched', { organization_id: activeOrgId });
    analytics.group('organization', activeOrgId);
    analyticsOrgId.current = activeOrgId;
  }, [activeOrgId, user?.id]);

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
    <MonitoringErrorBoundary monitoring={clientMonitoring} fallback={(reset) => <MonitoringFallback onRetry={reset} />}>
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
    </MonitoringErrorBoundary>
  );
}

function MonitoringFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.fallback}>
      <Text variant="h2">Something went wrong</Text>
      <Button label="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
});
