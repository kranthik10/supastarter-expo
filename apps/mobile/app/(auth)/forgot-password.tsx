import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Screen, Text } from '@repo/ui';
import { authErrorMessageKey, classifyAuthError, useAuth, validateEmail } from '@repo/auth';
import { config } from '@repo/config';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const requestPasswordReset = useAuth((state) => state.requestPasswordReset);
  const loading = useAuth((state) => state.loading);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const submit = async () => {
    if (!validateEmail(email)) return setError(t('auth.invalidEmail'));
    setError(null);
    try {
      await requestPasswordReset(email.trim().toLowerCase(), `${config.appScheme}://reset-password`);
      setSent(true);
    } catch (requestError) {
      const code = classifyAuthError(requestError);
      if (code === 'network' || code === 'rate_limited') {
        setError(t(authErrorMessageKey(code)));
        return;
      }
      // Keep account existence private even if a provider fails only for known accounts.
      setSent(true);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('auth.forgotTitle')}</Text>
        <Text variant="body" muted>
          {t('auth.forgotSubtitle')}
        </Text>
      </View>
      <Card style={styles.card}>
        {sent ? (
          <>
            <Text variant="h2">📬 {t('auth.resetSent')}</Text>
            <Text variant="body" muted>
              {t('auth.resetSentBody', { email })}
            </Text>
            <Button
              label={t('common.back')}
              variant="secondary"
              onPress={() => router.back()}
              full
            />
          </>
        ) : (
          <>
            <Input
              label={t('common.email')}
              placeholder="you@company.com"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={error}
            />
            <Button label={t('auth.sendResetLink')} loading={loading} onPress={() => void submit()} full />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginTop: 24, marginBottom: 20 },
  card: { padding: 18, gap: 8 },
});
