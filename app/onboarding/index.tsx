import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Text } from '../../ui';
import { useTheme } from '../../lib/use-theme';
import { useAuth } from '../../lib/auth-store';
import { useOrgs } from '../../lib/org-store';

const TOTAL = 3;

export default function Onboarding() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user)!;
  const updateProfile = useAuth((s) => s.updateProfile);
  const createOrg = useOrgs((s) => s.createOrg);

  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState(user.name);
  const [orgName, setOrgName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const next = async () => {
    setError(null);
    if (step === 1 && !name.trim()) return setError(t('auth.nameRequired'));
    if (step === 2 && !orgName.trim()) return setError(t('auth.nameRequired'));
    if (step === 1) await updateProfile({ name: name.trim() });
    if (step === 2) createOrg(orgName, user);
    setStep((s) => Math.min(s + 1, TOTAL));
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL + 1 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              { backgroundColor: i <= step ? theme.primary : theme.surfaceAlt },
            ]}
          />
        ))}
      </View>
      <Text variant="small" muted align="center">
        {t('onboarding.step', { current: step + 1, total: TOTAL + 1 })}
      </Text>

      <Card style={styles.card}>
        {step === 0 && (
          <>
            <Text variant="h1" align="center">
              🎉
            </Text>
            <Text variant="h1" align="center">
              {t('onboarding.welcomeTitle')}
            </Text>
            <Text variant="body" muted align="center">
              {t('onboarding.welcomeBody')}
            </Text>
          </>
        )}
        {step === 1 && (
          <>
            <Text variant="h2">{t('onboarding.profileTitle')}</Text>
            <Text variant="body" muted>
              {t('onboarding.profileBody')}
            </Text>
            <Input label={t('common.name')} value={name} onChangeText={setName} error={error} />
          </>
        )}
        {step === 2 && (
          <>
            <Text variant="h2">🏢 {t('onboarding.orgTitle')}</Text>
            <Text variant="body" muted>
              {t('onboarding.orgBody')}
            </Text>
            <Input
              label={t('onboarding.orgName')}
              placeholder="Acme Inc"
              value={orgName}
              onChangeText={setOrgName}
              error={error}
            />
          </>
        )}
        {step === 3 && (
          <>
            <Text variant="h1" align="center">
              🚀
            </Text>
            <Text variant="h1" align="center">
              {t('onboarding.doneTitle')}
            </Text>
            <Text variant="body" muted align="center">
              {t('onboarding.doneBody')}
            </Text>
          </>
        )}
      </Card>

      <View style={styles.footer}>
        {step > 0 && step < 3 ? (
          <Pressable onPress={() => setStep((s) => s - 1)} hitSlop={8}>
            <Text muted>← {t('common.back')}</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Button
          label={step === 3 ? t('onboarding.finish') : t('common.continue')}
          onPress={() => void (step === 3 ? router.replace('/home') : next())}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    gap: 16,
    justifyContent: 'center',
  },
  progressRow: { flexDirection: 'row', gap: 6 },
  progressDot: { flex: 1, height: 4, borderRadius: 2 },
  card: { gap: 10, paddingVertical: 28 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
