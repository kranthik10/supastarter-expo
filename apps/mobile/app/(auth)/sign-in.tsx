import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Screen, Text } from '@repo/ui';
import { useAuth, validateEmail } from '@repo/auth';

export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const loading = useAuth((s) => s.loading);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!validateEmail(email)) return setError(t('auth.invalidEmail'));
    try {
      await signIn(email.trim(), password);
      router.replace('/home');
    } catch (e) {
      setError(t(`auth.${(e as Error).message === 'shortPassword' ? 'shortPassword' : 'invalidEmail'}`));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('auth.welcomeBack')}</Text>
        <Text variant="body" muted>
          {t('auth.signInSubtitle')}
        </Text>
      </View>
      <Card style={styles.card}>
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
        <Button label={t('common.signIn')} loading={loading} onPress={() => void submit()} full />
        <Button
          label={t('auth.forgotPassword')}
          variant="ghost"
          size="md"
          onPress={() => router.push('/forgot-password')}
        />
        <Text variant="small" muted align="center">
          {t('common.or')}
        </Text>
        <Button label={t('auth.continueWithGithub')} variant="secondary" onPress={() => void submit()} full />
      </Card>
      <Text variant="small" muted style={{ marginTop: 8 }}>
        💡 {t('auth.demoHint')}
      </Text>
      <View style={styles.switchRow}>
        <Text variant="small" muted>
          {t('auth.noAccount')}{' '}
        </Text>
        <Button
          label={t('common.signUp')}
          variant="ghost"
          size="md"
          onPress={() => router.replace('/sign-up')}
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
