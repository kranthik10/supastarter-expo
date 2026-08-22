import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from '../../ui';
import { useTheme } from '../../lib/use-theme';
import { plans, planOrder } from '../../lib/billing/plans';
import { spacing } from '../../lib/theme';

const features = [
  { key: 1, icon: '🔐' },
  { key: 2, icon: '🏢' },
  { key: 3, icon: '💳' },
  { key: 4, icon: '🌍' },
] as const;

export default function Landing() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['bottom']} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.pill, { backgroundColor: theme.primary + '18' }]}>
            <Text style={{ color: theme.primary }} variant="small">
              ✨ Expo · React Native · TypeScript
            </Text>
          </View>
          <Text variant="display" align="center">
            {t('marketing.heroTitle')}
          </Text>
          <Text variant="body" muted align="center">
            {t('marketing.heroSubtitle')}
          </Text>
          <View style={styles.ctaRow}>
            <Button label={t('marketing.cta')} onPress={() => router.push('/sign-up')} full />
            <Button
              label={t('common.learnMore')}
              variant="secondary"
              onPress={() => router.push('/sign-in')}
              full
            />
          </View>
        </View>

        <Text variant="h1" align="center">
          {t('marketing.featuresTitle')}
        </Text>
        <Text variant="body" muted align="center" style={styles.sectionSubtitle}>
          {t('marketing.featuresSubtitle')}
        </Text>
        <View style={styles.features}>
          {features.map((f) => (
            <Card key={f.key} style={styles.featureCard}>
              <Text variant="h2">{f.icon}</Text>
              <Text variant="h3">{t(`marketing.feature${f.key}Title`)}</Text>
              <Text variant="small" muted>
                {t(`marketing.feature${f.key}Body`)}
              </Text>
            </Card>
          ))}
        </View>

        <Text variant="h1" align="center" style={styles.pricingTitle}>
          {t('marketing.pricingTitle')}
        </Text>
        <Text variant="body" muted align="center" style={styles.sectionSubtitle}>
          {t('marketing.pricingSubtitle')}
        </Text>
        <View style={styles.plans}>
          {planOrder.map((id) => {
            const plan = plans[id];
            return (
              <Card
                key={id}
                style={[
                  styles.planCard,
                  plan.highlight && { borderColor: theme.primary, borderWidth: 2 },
                ]}
              >
                <View style={styles.planHead}>
                  <Text variant="h2">{t(`billing.${id}`)}</Text>
                  {plan.highlight ? (
                    <Text color={theme.primary} variant="small">
                      ★
                    </Text>
                  ) : null}
                </View>
                <Text variant="h1">
                  ${plan.price}
                  <Text variant="small" muted>
                    {' '}
                    {t('marketing.monthly')}
                  </Text>
                </Text>
                <Text variant="small" muted>
                  {t('billing.seats', { seats: plan.seats })}
                </Text>
                <Button
                  label={t('marketing.chooseplan', { plan: t(`billing.${id}`) })}
                  variant={plan.highlight ? 'primary' : 'secondary'}
                  size="md"
                  onPress={() => router.push('/sign-up')}
                />
              </Card>
            );
          })}
        </View>

        <Text variant="small" muted align="center" style={styles.footerNote}>
          © 2026 supastarter-expo — built with Expo Router. Own your code.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: spacing(4), paddingBottom: 48 },
  hero: { alignItems: 'center', gap: spacing(3), marginTop: spacing(8) },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  ctaRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: spacing(1) },
  sectionSubtitle: { marginTop: -spacing(2), marginBottom: spacing(1) },
  features: { gap: 12 },
  featureCard: { gap: 6 },
  pricingTitle: { marginTop: spacing(4) },
  plans: { gap: 12 },
  planCard: { gap: 6 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerNote: { marginTop: spacing(4) },
});
