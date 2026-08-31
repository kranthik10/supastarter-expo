import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { UserPlus, CreditCard, FolderKanban } from 'lucide-react-native';
import { Screen, Card, Text, Button, Badge } from '@repo/ui';
import { useTheme } from '@/lib/use-theme';
import { useAuth } from '@repo/auth';
import { useActiveOrg } from '@repo/organizations';
import { useBilling } from '@repo/billing';

export default function Home() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user)!;
  const org = useActiveOrg();
  const plan = useBilling((s) => s.plan);

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('home.greeting', { name: user.name.split(' ')[0] })}</Text>
        <Text variant="body" muted>
          {t('home.subtitle')}
        </Text>
        <Badge label={org ? org.name : '—'} />
      </View>

      <View style={styles.stats}>
        <Card style={styles.statCard}>
          <FolderKanban color={theme.primary} size={20} />
          <Text variant="h1">3</Text>
          <Text variant="small" muted>
            {t('home.statsProjects')}
          </Text>
        </Card>
        <Card style={styles.statCard}>
          <UserPlus color={theme.primary} size={20} />
          <Text variant="h1">{org?.members.length ?? 1}</Text>
          <Text variant="small" muted>
            {t('home.statsMembers')}
          </Text>
        </Card>
        <Card style={styles.statCard}>
          <CreditCard color={theme.primary} size={20} />
          <Text variant="h1">{t(`billing.${plan}`)}</Text>
          <Text variant="small" muted>
            {t('home.statsPlan')}
          </Text>
        </Card>
      </View>

      <Text variant="h2" style={styles.sectionTitle}>
        {t('home.quickActions')}
      </Text>
      <View style={styles.actions}>
        <Button
          label="🤖 Assistant"
          variant="secondary"
          onPress={() => router.push('/assistant')}
          full
        />
        <Button
          label={t('home.inviteMember')}
          variant="secondary"
          onPress={() => router.push('/team')}
          full
        />
        <Button
          label={t('home.manageBilling')}
          variant="secondary"
          onPress={() => router.push('/billing')}
          full
        />
      </View>

      <Text variant="h2" style={styles.sectionTitle}>
        {t('home.recentActivity')}
      </Text>
      <Card style={styles.emptyCard}>
        <Text variant="small" muted align="center">
          {t('home.emptyActivity')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginTop: 12, marginBottom: 20 },
  stats: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'flex-start', gap: 6 },
  sectionTitle: { marginTop: 24, marginBottom: 10 },
  actions: { gap: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: 28 },
});
