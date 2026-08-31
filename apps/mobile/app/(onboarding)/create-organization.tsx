import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Text } from '@repo/ui';
import { useTheme } from '@repo/ui';
import { useAuth } from '@repo/auth';
import { useOrgs } from '@repo/organizations';

export default function CreateOrganization() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const createOrg = useOrgs((s) => s.createOrg);
  const hydrated = useAuth((s) => s.hydrated);

  const [orgName, setOrgName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  if (!hydrated) return null;

  const submit = async () => {
    setError(null);
    if (!orgName.trim()) return setError(t('auth.nameRequired'));
    if (!user) return;
    const slug = orgName.trim().toLowerCase().replace(/\s+/g, '-');
    try {
      await createOrg(orgName.trim(), slug);
      router.replace('/home');
    } catch (e: any) {
      setError(e?.message ?? t('common.error'));
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Card style={styles.card}>
        <Text variant="h2">🏢 {t('onboarding.orgTitle')}</Text>
        <Text variant="body" muted>{t('onboarding.orgBody')}</Text>
        <Input
          label={t('onboarding.orgName')}
          placeholder="Acme Inc"
          value={orgName}
          onChangeText={setOrgName}
          error={error}
        />
      </Card>
      <Button label={t('common.continue')} onPress={submit} full />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, justifyContent: 'center', gap: 20 },
  card: { gap: 12 },
});
