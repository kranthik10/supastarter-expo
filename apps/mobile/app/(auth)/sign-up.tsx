import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Screen, Text } from '@repo/ui';
import { authErrorMessageKey, classifyAuthError, useAuth, validateSignUpInput } from '@repo/auth';
import { consumePendingLink } from '@/lib/linking';

export default function SignUp() {
  const { t } = useTranslation();
  const router = useRouter();
  const signUp = useAuth((s) => s.signUp);
  const loading = useAuth((s) => s.loading);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const validation = validateSignUpInput(name, email, password);
    if (!validation.ok) return setError(t(authErrorMessageKey(validation.code)));
    try {
      await signUp(validation.value.name, validation.value.email, validation.value.password);
      const pending = await consumePendingLink().catch(() => null);
      (router.replace as unknown as (path: string) => void)(pending ?? '/onboarding');
    } catch (e) {
      setError(t(authErrorMessageKey(classifyAuthError(e))));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('auth.createAccount')}</Text>
        <Text variant="body" muted>
          {t('auth.signUpSubtitle')}
        </Text>
      </View>
      <Card style={styles.card}>
        <Input
          label={t('common.name')}
          placeholder="Ada Lovelace"
          autoComplete="name"
          value={name}
          onChangeText={setName}
        />
        <Input
          label={t('common.email')}
          placeholder="you@company.com"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label={t('common.password')}
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          error={error}
        />
        <Button label={t('common.getStarted')} loading={loading} onPress={() => void submit()} full />
      </Card>
      <View style={styles.switchRow}>
        <Text variant="small" muted>
          {t('auth.haveAccount')}{' '}
        </Text>
        <Button
          label={t('common.signIn')}
          variant="ghost"
          size="md"
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginTop: 24, marginBottom: 20 },
  card: { padding: 18 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
});
