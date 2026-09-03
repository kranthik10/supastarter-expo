import React, { useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Screen, Card, Text, Button, Badge } from '@repo/ui';
import { useTheme } from '@/lib/use-theme';
import { plans, planOrder, resolveBillingView, getBillingProvider, useBilling, type PlanId } from '@repo/billing';
import { useActiveOrg } from '@repo/organizations';
import { trpc } from '@repo/api';

export default function Billing() {
  const theme = useTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const org = useActiveOrg();
  const organizationId = org?.id ?? null;
  const setSubscription = useBilling((s) => s.setSubscription);
  const clearSubscription = useBilling((s) => s.clearSubscription);

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscription', organizationId],
    queryFn: () => trpc.billing.getSubscription.query({ organizationId: organizationId! }),
    enabled: !!organizationId,
  });

  const row = subscriptionQuery.data ?? null;
  const view = resolveBillingView(
    row
      ? {
          planId: row.planId,
          status: row.status,
          trialEndsAt: row.trialEndsAt,
          graceEndsAt: row.graceEndsAt,
        }
      : null
  );

  useEffect(() => {
    // Mirror the fail-closed resolved view, never the raw server row, so
    // direct store consumers cannot read untrusted plan values.
    if (row) setSubscription({ planId: view.planId, status: view.status });
    else if (!subscriptionQuery.isFetching) clearSubscription();
  }, [row, view.planId, view.status, subscriptionQuery.isFetching, setSubscription, clearSubscription]);

  const startCheckout = async (planId: PlanId) => {
    if (!organizationId) return;
    try {
      const { url } = await getBillingProvider().createCheckout({ organizationId, planId });
      await WebBrowser.openBrowserAsync(url);
      await queryClient.invalidateQueries({ queryKey: ['billing', 'subscription', organizationId] });
    } catch {
      // The stub provider throws while no real provider is configured.
      // Never present local selection as a subscription.
      Alert.alert(t('billing.title'), t('billing.providerNotConfigured'));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('billing.title')}</Text>
        <Text variant="body" muted>
          {t('billing.subtitle')}
        </Text>
      </View>

      {!organizationId ? (
        <Card>
          <Text muted>{t('billing.noOrganization')}</Text>
        </Card>
      ) : subscriptionQuery.isPending ? (
        <Card>
          <Text muted>{t('common.loading')}</Text>
        </Card>
      ) : subscriptionQuery.isError ? (
        <Card style={styles.stateCard}>
          <Text muted>{t('billing.loadError')}</Text>
          <Button label={t('common.retry')} variant="secondary" onPress={() => void subscriptionQuery.refetch()} full />
        </Card>
      ) : (
        <View style={styles.plans}>
          {planOrder.map((id) => {
            const p = plans[id];
            const current = id === view.planId;
            return (
              <Card
                key={id}
                style={[p.highlight && !current && { borderColor: theme.primary, borderWidth: 2 }]}
              >
                <View style={styles.planHead}>
                  <Text variant="h2">{t(`billing.${id}`)}</Text>
                  {current ? <Badge label={t('marketing.currentPlan')} tone="success" /> : null}
                </View>
                <Text variant="h1">
                  ${p.price}
                  <Text variant="small" muted>
                    {' '}
                    {t('marketing.monthly')}
                  </Text>
                </Text>
                <Text variant="small" muted>
                  {t(`billing.${id}Desc`)}
                </Text>
                <Text variant="small" muted>
                  {t('billing.seats', { seats: p.seats })}
                </Text>
                {current || id === 'free' ? null : (
                  <Button
                    label={t('billing.upgradeTo', { plan: t(`billing.${id}`) })}
                    variant="primary"
                    onPress={() => void startCheckout(id)}
                    full
                  />
                )}
              </Card>
            );
          })}
        </View>
      )}

      <Card style={styles.portal}>
        <Text variant="h3">{t('billing.managePortal')}</Text>
        <Text variant="small" muted>
          {t('billing.manageNote')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginTop: 12, marginBottom: 20 },
  plans: { gap: 12 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stateCard: { gap: 12 },
  portal: { marginTop: 20, gap: 6 },
});
