import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Screen, Text } from '@repo/ui';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('auth.verificationUnavailableTitle')}</Text>
        <Text variant="body" muted>
          {t('auth.verificationUnavailableBody')}
        </Text>
      </View>
      <Card style={styles.card}>
        <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} full />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 16 },
  card: { gap: 14 },
});
