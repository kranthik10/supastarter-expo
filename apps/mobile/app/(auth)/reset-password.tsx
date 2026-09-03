import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Screen, Text } from '@repo/ui';
import {
  authErrorMessageKey,
  classifyAuthError,
  useAuth,
  validateResetPasswordInput,
} from '@repo/auth';

export default function ResetPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  const resetPassword = useAuth((state) => state.resetPassword);
  const clearLocalSession = useAuth((state) => state.clearLocalSession);
  const loading = useAuth((state) => state.loading);
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);
  const [complete, setComplete] = React.useState(false);

  const token = typeof params.token === 'string' ? params.token : '';
  const callbackError = typeof params.error === 'string' ? params.error : '';
  const invalidLink = callbackError === 'INVALID_TOKEN' || !token;

  const submit = async () => {
    setMessage(null);
    const validation = validateResetPasswordInput(token, password, confirmation);
    if (!validation.ok) {
      setMessage(t(authErrorMessageKey(validation.code)));
      return;
    }

    try {
      await resetPassword(validation.value.token, validation.value.password);
      // Single-use credential: drop it from memory and route params immediately
      // after successful consumption so it does not linger in history.
      setPassword('');
      setConfirmation('');
      router.setParams({ token: '' });
      await clearLocalSession();
      setComplete(true);
    } catch (error) {
      setMessage(t(authErrorMessageKey(classifyAuthError(error))));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('auth.resetTitle')}</Text>
        <Text variant="body" muted>{t('auth.resetSubtitle')}</Text>
      </View>
      <Card style={styles.card}>
        {complete ? (
          <>
            <Text variant="h2">{t('auth.resetComplete')}</Text>
            <Text variant="body" muted>{t('auth.resetCompleteBody')}</Text>
            <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} full />
          </>
        ) : invalidLink ? (
          <>
            <Text variant="h2">{t('auth.invalidResetTitle')}</Text>
            <Text variant="body" muted>{t('auth.invalidResetToken')}</Text>
            <Button label={t('auth.requestNewLink')} onPress={() => router.replace('/forgot-password')} full />
          </>
        ) : (
          <>
            <Input
              label={t('auth.newPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            <Input
              label={t('auth.confirmPassword')}
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              error={message}
            />
            <Button label={t('auth.resetPassword')} loading={loading} onPress={() => void submit()} full />
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
