import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text } from '@repo/ui';
import { useTheme } from '@repo/ui';

export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Card style={styles.card}>
        <Text variant="h1" align="center">🎉</Text>
        <Text variant="h1" align="center">{t('onboarding.welcomeTitle')}</Text>
        <Text variant="body" muted align="center">{t('onboarding.welcomeBody')}</Text>
      </Card>
      <Button label={t('common.continue')} onPress={() => (router.push as unknown as (s: string) => void)('/(onboarding)/create-organization')} full />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, justifyContent: 'center', gap: 20 },
  card: { gap: 10, alignItems: 'center' },
});
