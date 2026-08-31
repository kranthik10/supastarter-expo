import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Screen, Text } from '@repo/ui';
import { useTheme } from '@repo/ui';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();
  const email = typeof params.email === 'string' ? params.email : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('auth.verifyTitle', { defaultValue: 'Check your email' })}</Text>
        <Text variant="body" muted>
          {email
            ? t('auth.verifyBody', {
                defaultValue: `We sent a verification link to ${email}. Open it to continue.`,
                email,
              })
            : t('auth.verifyBodyGeneric', { defaultValue: 'We sent a verification link to your email. Open it to continue.' })}
        </Text>
      </View>
      <Card style={styles.card}>
        <Text variant="body" align="center" muted>
          {t('auth.verifyHint', { defaultValue: 'Didn’t receive it? Check spam or resend.' })}
        </Text>
        <Button
          label={t('auth.resendVerification', { defaultValue: 'Resend email' })}
          variant="ghost"
          onPress={() => router.replace('/sign-in')}
          full
        />
        <Button label={t('common.continue')} onPress={() => router.replace('/sign-in')} full />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 16 },
  card: { gap: 14 },
});
