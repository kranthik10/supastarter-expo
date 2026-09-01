import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react-native';
import Constants from 'expo-constants';
import { Screen, Card, Text, Button, SegmentedControl, Avatar, ListRow, Input } from '@repo/ui';
import { useTheme } from '@/lib/use-theme';
import { useAuth } from '@repo/auth';
import { useSettings, type ThemeMode, type Locale } from '@/lib/settings-store';
import { trpc } from '@repo/api';

type SessionSummary = {
  id: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
};

type PreferencePatch = Parameters<typeof trpc.settings.updatePreferences.mutate>[0];

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const updateProfile = useAuth((s) => s.updateProfile);
  const changePassword = useAuth((s) => s.changePassword);
  const clearLocalSession = useAuth((s) => s.clearLocalSession);
  const { themeMode, setThemeMode, locale, setLocale } = useSettings();

  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [inviteEmails, setInviteEmails] = useState(true);
  const [billingAlerts, setBillingAlerts] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const showError = (error: unknown) => {
    Alert.alert(t('settings.actionFailed'), error instanceof Error ? error.message : t('settings.unknownError'));
  };

  const profileQuery = useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => trpc.settings.getProfile.query(),
    enabled: !!user,
  });
  const preferencesQuery = useQuery({
    queryKey: ['settings', 'preferences'],
    queryFn: () => trpc.settings.getPreferences.query(),
    enabled: !!user,
  });
  const sessionsQuery = useQuery({
    queryKey: ['settings', 'sessions'],
    queryFn: () => trpc.settings.listSessions.query(),
    enabled: !!user,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch: PreferencePatch) => trpc.settings.updatePreferences.mutate(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'preferences'] }),
  });
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => trpc.settings.revokeSession.mutate({ sessionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] }),
  });
  const revokeOtherSessionsMutation = useMutation({
    mutationFn: () => trpc.settings.revokeOtherSessions.mutate(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] }),
  });
  const deleteAccountMutation = useMutation({ mutationFn: () => trpc.settings.deleteAccount.mutate() });

  useEffect(() => {
    setProfileName(profileQuery.data?.name ?? user?.name ?? '');
  }, [profileQuery.data?.name, user?.name]);

  useEffect(() => {
    const preferences = preferencesQuery.data;
    if (!preferences) return;
    setThemeMode(preferences.theme);
    setLocale(preferences.locale);
    void i18n.changeLanguage(preferences.locale);
    setInviteEmails(preferences.inviteEmails);
    setBillingAlerts(preferences.billingAlerts);
    setMarketingOptIn(preferences.marketingOptIn);
  }, [preferencesQuery.data, setLocale, setThemeMode, i18n]);

  useEffect(() => {
    if (profileQuery.error) showError(profileQuery.error);
    if (preferencesQuery.error) showError(preferencesQuery.error);
    if (sessionsQuery.error) showError(sessionsQuery.error);
    // Query errors are stable until the next fetch; each error is shown once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.error, preferencesQuery.error, sessionsQuery.error]);

  const saveProfile = async () => {
    const name = profileName.trim();
    if (!name) {
      Alert.alert(t('settings.actionFailed'), t('settings.nameRequired'));
      return;
    }
    setProfileLoading(true);
    try {
      await updateProfile({ name });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
      Alert.alert(t('settings.saved'));
    } catch (error) {
      showError(error);
    } finally {
      setProfileLoading(false);
    }
  };

  const updatePreference = async (patch: PreferencePatch) => {
    try {
      await updatePreferencesMutation.mutateAsync(patch);
    } catch (error) {
      showError(error);
      await preferencesQuery.refetch();
    }
  };

  const onThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    void updatePreference({ theme: mode });
  };

  const onLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale);
    void i18n.changeLanguage(nextLocale);
    void updatePreference({ locale: nextLocale });
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert(t('settings.actionFailed'), t('settings.passwordRequired'));
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword, false);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert(t('settings.passwordChanged'));
    } catch (error) {
      showError(error);
    } finally {
      setPasswordLoading(false);
    }
  };

  const revokeOtherSessions = async () => {
    try {
      await revokeOtherSessionsMutation.mutateAsync();
    } catch (error) {
      showError(error);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      await revokeSessionMutation.mutateAsync(sessionId);
    } catch (error) {
      showError(error);
    }
  };

  const confirmDelete = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAccount'),
        style: 'destructive',
        onPress: () => {
          void deleteAccountMutation
            .mutateAsync()
            .then(() => clearLocalSession())
            .then(() => router.replace('/'))
            .catch(showError);
        },
      },
    ]);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const displayName = profileQuery.data?.name ?? user?.name ?? user?.email?.split('@')[0] ?? t('common.user');
  const sessions = (sessionsQuery.data ?? []) as SessionSummary[];
  const sessionLoading = sessionsQuery.isFetching || revokeSessionMutation.isPending || revokeOtherSessionsMutation.isPending;
  const preferenceLoading = preferencesQuery.isFetching || updatePreferencesMutation.isPending;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('settings.title')}</Text>
      </View>

      <Text variant="h3" style={styles.section}>{t('settings.profile')}</Text>
      <Card style={styles.account}>
        <ListRow
          leading={<Avatar name={displayName} image={profileQuery.data?.image ?? user?.image ?? undefined} size={48} />}
          title={displayName}
          subtitle={profileQuery.data?.email ?? user?.email ?? ''}
        />
        <Input label={t('settings.name')} value={profileName} onChangeText={setProfileName} maxLength={120} />
        <Button label={t('settings.save')} onPress={() => void saveProfile()} loading={profileLoading} full />
      </Card>

      <Text variant="h3" style={styles.section}>{t('settings.appearance')}</Text>
      <Card>
        <SegmentedControl<ThemeMode>
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
          value={themeMode}
          onChange={onThemeChange}
        />
      </Card>

      <Text variant="h3" style={styles.section}>{t('settings.language')}</Text>
      <Card>
        <SegmentedControl<Locale>
          options={[
            { value: 'en', label: '🇺🇸 English' },
            { value: 'de', label: '🇩🇪 Deutsch' },
          ]}
          value={locale}
          onChange={onLocaleChange}
        />
      </Card>

      <Text variant="h3" style={styles.section}>{t('settings.notifications')}</Text>
      <Card>
        <PreferenceRow label={t('settings.inviteEmails')} value={inviteEmails} disabled={preferenceLoading} onChange={(value) => { setInviteEmails(value); void updatePreference({ inviteEmails: value }); }} />
        <PreferenceRow label={t('settings.billingAlerts')} value={billingAlerts} disabled={preferenceLoading} onChange={(value) => { setBillingAlerts(value); void updatePreference({ billingAlerts: value }); }} />
        <PreferenceRow label={t('settings.marketingOptIn')} value={marketingOptIn} disabled={preferenceLoading} onChange={(value) => { setMarketingOptIn(value); void updatePreference({ marketingOptIn: value }); }} />
        <Text variant="small" muted>{t('settings.quietHoursNote')}</Text>
      </Card>

      <Text variant="h3" style={styles.section}>{t('settings.security')}</Text>
      <Card style={styles.formCard}>
        <Input label={t('settings.currentPassword')} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" />
        <Input label={t('settings.newPassword')} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
        <Button label={t('settings.changePassword')} onPress={() => void savePassword()} loading={passwordLoading} full />
      </Card>

      <Card style={styles.sessions}>
        <View style={styles.sessionHeader}>
          <Text variant="h3">{t('settings.sessions')}</Text>
          <Button label={t('settings.revokeOtherSessions')} size="md" variant="ghost" loading={sessionLoading} onPress={() => void revokeOtherSessions()} />
        </View>
        {sessions.map((session) => (
          <ListRow
            key={session.id}
            title={session.current ? t('settings.currentSession') : t('settings.otherSession')}
            subtitle={session.userAgent ?? session.ipAddress ?? t('settings.unknownDevice')}
            trailing={session.current ? <BadgeLike label={t('settings.current')} /> : <Button label={t('settings.revoke')} size="md" variant="ghost" loading={sessionLoading} onPress={() => void revokeSession(session.id)} />}
          />
        ))}
      </Card>

      <Text variant="h3" style={styles.section}>{t('settings.dangerZone')}</Text>
      <Card>
        <Text variant="small" muted>{t('settings.deleteOwnerNote')}</Text>
        <Button label={t('settings.deleteAccount')} variant="danger" loading={deleteAccountMutation.isPending} onPress={confirmDelete} full />
      </Card>

      <View style={styles.footer}>
        <Button
          label={t('common.signOut')}
          variant="secondary"
          icon={<LogOut color={theme.text} size={18} />}
          onPress={() => { void signOut().then(() => router.replace('/')); }}
          full
        />
        <Text variant="small" muted align="center">{t('settings.version')} {version}</Text>
      </View>
    </Screen>
  );
}

function PreferenceRow({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.preferenceRow}>
      <Text>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

function BadgeLike({ label }: { label: string }) {
  return <Text variant="small" muted>{label}</Text>;
}

const styles = StyleSheet.create({
  header: { marginTop: 12, marginBottom: 16 },
  account: { paddingVertical: 8, gap: 4 },
  formCard: { gap: 4 },
  section: { marginTop: 20, marginBottom: 8 },
  preferenceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessions: { marginTop: 12 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { marginTop: 24, gap: 12, alignItems: 'center' },
});
