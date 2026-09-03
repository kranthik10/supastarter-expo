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
import { useDeepLinks, consumePendingLink, clearPendingLink, storePendingLink } from '@/lib/linking';
import { addNotificationResponseListener, getLastNotificationData, type SafeNotificationData } from '@repo/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClientMonitoring, installClientErrorHandlers, MonitoringErrorBoundary } from '@repo/monitoring/client';
import { Text, Button } from '@repo/ui';
import { analytics, configureAnalytics, screenNameForPath, setAnalyticsEnabled } from '@repo/analytics';
import { config } from '@repo/config';
import Constants from 'expo-constants';
import { getAuthToken, setTRPCUnauthorizedHandler, trpc } from '@repo/api';
import { reconcileClientSession, terminateClientSession } from '@/lib/session-lifecycle';

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
  const orgsHydrated = useOrgs((s) => s.hydrated);
  const isDark = useSettings((s) => s.isDark);
  const locale = useSettings((s) => s.locale);
  const user = useAuth((s) => s.user);
  const activeOrgId = useOrgs((s) => s.activeOrgId);
  const pathname = usePathname();
  const previousUserId = useRef<string | null>(null);
  const sessionUserId = useRef<string | null | undefined>(undefined);
  const didInitialSessionRestore = useRef(false);
  const analyticsOrgId = useRef<string | null>(null);

  const hydrateAuth = useAuth((s) => s.hydrate);
  const hydrateOrgs = useOrgs((s) => s.hydrate);
  const hydrateBilling = useBilling((s) => s.hydrate);
  const hydrateSettings = useSettings((s) => s.hydrate);

  useDeepLinks();

  useEffect(() => installClientErrorHandlers(clientMonitoring), []);

  useEffect(() => {
    setTRPCUnauthorizedHandler(async (context) => {
      // Ignore stale in-flight responses: only a 401 carrying the currently
      // active credential may terminate this session. A delayed failure from
      // a previous user's request must never log out the active user.
      const currentToken = await getAuthToken();
      const currentAuthorization = currentToken ? `Bearer ${currentToken}` : null;
      // With no credential on either side there is no session to terminate;
      // skip the redirect so credential-less 401s on public screens stay put.
      if (!context.authorization && !currentAuthorization) return;
      if (context.authorization !== currentAuthorization) return;
      await terminateClientSession({
        clearQueryCache: () => queryClient.clear(),
        beginOrganizationSession: async (userId) => {
          await useOrgs.getState().beginSession(userId);
          await useOrgs.getState().refreshOrganizations();
        },
        clearOrganizationSession: () => useOrgs.getState().clearSession(),
        clearAuthSession: () => useAuth.getState().clearLocalSession(),
        clearPendingLink: () => clearPendingLink(),
      });
      sessionUserId.current = null;
      (router.replace as unknown as (path: string) => void)('/sign-in');
    });
    return () => setTRPCUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!hydrated || !orgsHydrated) return;
    let active = true;
    void reconcileClientSession(sessionUserId.current, user?.id ?? null, {
      clearQueryCache: () => queryClient.clear(),
      beginOrganizationSession: async (userId) => {
        await useOrgs.getState().beginSession(userId);
        await useOrgs.getState().refreshOrganizations();
      },
      clearOrganizationSession: () => useOrgs.getState().clearSession(),
      clearAuthSession: () => useAuth.getState().clearLocalSession(),
    }).then(
      (nextUserId) => {
        if (!active) return;
        // Single ownership for post-restore pending links: only the first
        // reconciliation after hydration may consume a stored link. Later
        // sign-in completions own their own consume-and-navigate step, so this
        // must not run again and race them.
        const isInitialRestore = !didInitialSessionRestore.current;
        didInitialSessionRestore.current = true;
        sessionUserId.current = nextUserId;
        if (isInitialRestore && nextUserId) {
          void consumePendingLink()
            .catch(() => null)
            .then((pending) => {
              if (pending && active) (router.push as unknown as (s: string) => void)(pending);
            });
        }
      },
      () => {
        // A failed restore (network/expired session mid-hydration) leaves refs
        // untouched so a later user change still triggers a fresh reconcile.
      }
    );
    return () => {
      active = false;
    };
  }, [hydrated, orgsHydrated, user?.id]);

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
