import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CreditCard, HardDrive, Settings, UserPlus, Users } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen, Card, Text, Button, Badge } from '@repo/ui';
import { useTheme } from '@/lib/use-theme';
import { useAuth } from '@repo/auth';
import { useActiveOrg } from '@repo/organizations';
import { analytics } from '@repo/analytics';
import { trpc } from '@repo/api';
import { dashboardActionsForRole, formatBytes, formatCount, formatUsage, subscriptionTone } from '@/lib/dashboard';

export default function Home() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const org = useActiveOrg();
  const viewedOrganization = useRef<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['dashboard', 'overview', org?.id],
    queryFn: () => trpc.dashboard.overview.query({ organizationId: org!.id }),
    enabled: Boolean(user && org?.id),
  });

  useEffect(() => {
    if (!org?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview', org.id] });
  }, [org?.id, queryClient]);

  useEffect(() => {
    const organizationId = overviewQuery.data?.organization.id;
    if (!organizationId || viewedOrganization.current === organizationId) return;
    viewedOrganization.current = organizationId;
    analytics.capture('dashboard_viewed', { organization_id: organizationId });
  }, [overviewQuery.data]);

  const selectAction = (action: 'invite_member' | 'manage_billing' | 'team' | 'notifications' | 'settings') => {
    analytics.capture('dashboard_quick_action_selected', { action });
    if (action === 'invite_member' || action === 'team') router.push('/team');
    if (action === 'manage_billing') router.push('/billing');
    if (action === 'notifications') router.push('/notifications' as never);
    if (action === 'settings') router.push('/settings');
  };

  const displayName = user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';
  const overview = overviewQuery.data;
  const role = overview?.organization.role;
  const actions = role ? dashboardActionsForRole(role) : { canInvite: false, canManageBilling: false };
  const graceEndsAt = overview?.subscription?.graceEndsAt;
  const graceActive = Boolean(
    overview?.subscription?.status === 'past_due' && graceEndsAt && new Date(graceEndsAt).getTime() > Date.now()
  );
  const subscriptionStatus = subscriptionTone(overview?.subscription?.status ?? null, graceActive);
  const storageLimitBytes = overview?.entitlements.storage.limitGb === null || overview?.entitlements.storage.limitGb === undefined
    ? null
    : overview.entitlements.storage.limitGb * 1024 * 1024 * 1024;

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text variant="h1">{t('home.greeting', { name: displayName })}</Text>
          <Text variant="body" muted>{t('home.subtitle')}</Text>
          {overview ? (
            <View style={styles.context}>
              <Badge label={overview.organization.name} />
              <Text variant="small" muted>{t('home.organizationRole', { role: t(`team.${overview.organization.role}`) })}</Text>
            </View>
          ) : null}
        </View>

        {!org ? (
          <Card style={styles.stateCard}>
            <Text variant="h2">{t('home.noOrganizationTitle')}</Text>
            <Text muted>{t('home.noOrganizationBody')}</Text>
            <Button label={t('home.createOrganization')} onPress={() => router.push('/create-organization')} full />
          </Card>
        ) : overviewQuery.isPending ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={theme.primary} />
            <Text muted>{t('common.loading')}</Text>
          </Card>
        ) : overviewQuery.isError ? (
          <Card style={styles.stateCard}>
            <Text variant="h2">{t('home.dashboardError')}</Text>
            <Button label={t('home.retry')} onPress={() => void overviewQuery.refetch()} variant="secondary" full />
          </Card>
        ) : overview ? (
          <>
            <Card style={styles.planCard}>
              <View style={styles.cardHeader}>
                <View style={styles.iconTitle}>
                  <CreditCard color={theme.primary} size={20} />
                  <Text variant="h2">{t('home.planSummary')}</Text>
                </View>
                <Badge label={t(`home.subscription.${subscriptionStatus}`)} tone={subscriptionStatus === 'active' ? 'success' : 'amber'} />
              </View>
              <Text variant="h1">{t(`billing.${overview.planId}`)}</Text>
              {overview.subscription?.cancelAtPeriodEnd ? <Text variant="small" muted>{t('home.subscriptionCanceling')}</Text> : null}
              {actions.canManageBilling ? (
                <Button label={t('home.manageBilling')} onPress={() => selectAction('manage_billing')} variant="secondary" full />
              ) : null}
            </Card>

            <View style={styles.summaryGrid}>
              <Card style={styles.summaryCard}>
                <View style={styles.iconTitle}>
                  <Users color={theme.primary} size={18} />
                  <Text variant="h3">{t('home.teamSummary')}</Text>
                </View>
                <Text variant="h1">{formatCount(overview.team.memberCount, overview.entitlements.members.limit)}</Text>
                {overview.team.pendingInvitationCount > 0 ? (
                  <Text variant="small" muted>{t('home.pendingInvites', { count: overview.team.pendingInvitationCount })}</Text>
                ) : null}
                <Button label={actions.canInvite ? t('home.inviteMember') : t('home.viewTeam')} onPress={() => selectAction(actions.canInvite ? 'invite_member' : 'team')} size="md" variant="ghost" full />
              </Card>

              <Card style={styles.summaryCard}>
                <View style={styles.iconTitle}>
                  <HardDrive color={theme.primary} size={18} />
                  <Text variant="h3">{t('home.storageSummary')}</Text>
                </View>
                <Text variant="body">{formatUsage(overview.storage.readyBytes, storageLimitBytes)}</Text>
                <Text variant="small" muted>{t('home.storageConfirmed')}</Text>
                {overview.storage.pendingBytes > 0 ? (
                  <Text variant="small" muted>{t('home.storagePending', { size: formatBytes(overview.storage.pendingBytes) })}</Text>
                ) : null}
              </Card>
            </View>

            <Card style={styles.notificationCard}>
              <View style={styles.cardHeader}>
                <View style={styles.iconTitle}>
                  <Bell color={theme.primary} size={20} />
                  <Text variant="h2">{t('home.notificationsSummary')}</Text>
                </View>
                <Badge label={overview.notifications.unreadCount > 0 ? t('home.unreadNotifications', { count: overview.notifications.unreadCount }) : t('home.noUnreadNotifications')} tone={overview.notifications.unreadCount > 0 ? 'amber' : 'success'} />
              </View>
              <Button label={t('home.viewNotifications')} onPress={() => selectAction('notifications')} variant="secondary" full />
            </Card>

            <Text variant="h2" style={styles.sectionTitle}>{t('home.quickActions')}</Text>
            <View style={styles.actions}>
              {actions.canInvite ? <Button label={t('home.inviteMember')} icon={<UserPlus color={theme.text} size={18} />} onPress={() => selectAction('invite_member')} variant="secondary" full /> : null}
              <Button label={t('home.manageTeam')} icon={<Users color={theme.text} size={18} />} onPress={() => selectAction('team')} variant="secondary" full />
              <Button label={t('home.openSettings')} icon={<Settings color={theme.text} size={18} />} onPress={() => selectAction('settings')} variant="secondary" full />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  header: { gap: 6, marginTop: 12, marginBottom: 8 },
  context: { gap: 6, alignItems: 'flex-start' },
  stateCard: { gap: 12, alignItems: 'flex-start' },
  planCard: { gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  summaryGrid: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, gap: 8, minWidth: 0 },
  notificationCard: { gap: 10 },
  sectionTitle: { marginTop: 8, marginBottom: 2 },
  actions: { gap: 10 },
});
