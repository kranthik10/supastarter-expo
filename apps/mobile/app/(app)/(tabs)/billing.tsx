import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Card, Text, Button, Badge } from '@repo/ui';
import { useTheme } from '@/lib/use-theme';
import { plans, planOrder } from '@repo/billing';
import { useBilling } from '@repo/billing';

export default function Billing() {
  const theme = useTheme();
  const { t } = useTranslation();
  const plan = useBilling((s) => s.plan);
  const setPlan = useBilling((s) => s.setPlan);

  const choose = (id: (typeof planOrder)[number]) => {
    if (id === plan) return;
    setPlan(id);
    Alert.alert(
      id === 'free' ? t('billing.downgradeSuccess', { plan: t(`billing.${id}`) }) : t('billing.upgradeSuccess', { plan: t(`billing.${id}`) })
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('billing.title')}</Text>
        <Text variant="body" muted>
          {t('billing.subtitle')}
        </Text>
      </View>

      <View style={styles.plans}>
        {planOrder.map((id) => {
          const p = plans[id];
          const current = id === plan;
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
                {t('billing.seats', { seats: p.seats })}
              </Text>
              <Button
                label={current ? t('marketing.currentPlan') : t('marketing.chooseplan', { plan: t(`billing.${id}`) })}
                variant={current ? 'secondary' : 'primary'}
                disabled={current}
                onPress={() => choose(id)}
                full
              />
            </Card>
          );
        })}
      </View>

      <Card style={styles.portal}>
        <Text variant="h3">{t('billing.managePortal')}</Text>
        <Text variant="small" muted>
          {t('billing.portalNote')}
        </Text>
        <View style={styles.checkRow}>
          <Check color={theme.success} size={16} />
          <Text variant="small">Stripe</Text>
          <Check color={theme.success} size={16} />
          <Text variant="small">Polar</Text>
          <Check color={theme.success} size={16} />
          <Text variant="small">Lemon Squeezy</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginTop: 12, marginBottom: 20 },
  plans: { gap: 12 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  portal: { marginTop: 20, gap: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
