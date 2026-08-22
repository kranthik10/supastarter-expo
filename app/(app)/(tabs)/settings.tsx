import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react-native';
import Constants from 'expo-constants';
import { Screen, Card, Text, Button, SegmentedControl, Avatar, ListRow } from '../../../ui';
import { useTheme } from '../../../lib/use-theme';
import { useAuth } from '../../../lib/auth-store';
import { useSettings, type ThemeMode, type Locale } from '../../../lib/settings-store';

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const user = useAuth((s) => s.user)!;
  const signOut = useAuth((s) => s.signOut);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const { themeMode, setThemeMode, locale, setLocale } = useSettings();

  const confirmDelete = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAccount'),
        style: 'destructive',
        onPress: () => {
          void deleteAccount().then(() => router.replace('/'));
        },
      },
    ]);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1">{t('settings.title')}</Text>
      </View>

      <Card style={styles.account}>
        <ListRow
          leading={<Avatar name={user.name} color={user.avatarColor} size={48} />}
          title={user.name}
          subtitle={user.email}
        />
      </Card>

      <Text variant="h3" style={styles.section}>
        {t('settings.appearance')}
      </Text>
      <Card>
        <SegmentedControl<ThemeMode>
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
          value={themeMode}
          onChange={setThemeMode}
        />
      </Card>

      <Text variant="h3" style={styles.section}>
        {t('settings.language')}
      </Text>
      <Card>
        <SegmentedControl<Locale>
          options={[
            { value: 'en', label: '🇺🇸 English' },
            { value: 'de', label: '🇩🇪 Deutsch' },
          ]}
          value={locale}
          onChange={(l) => {
            setLocale(l);
            void i18n.changeLanguage(l);
          }}
        />
      </Card>

      <Text variant="h3" style={styles.section}>
        {t('settings.dangerZone')}
      </Text>
      <Card>
        <Button
          label={t('settings.deleteAccount')}
          variant="danger"
          onPress={confirmDelete}
          full
        />
      </Card>

      <View style={styles.footer}>
        <Button
          label={t('common.signOut')}
          variant="secondary"
          icon={<LogOut color={theme.text} size={18} />}
          onPress={() => {
            void signOut().then(() => router.replace('/'));
          }}
          full
        />
        <Text variant="small" muted align="center">
          {t('settings.version')} {version}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 12, marginBottom: 16 },
  account: { paddingVertical: 8 },
  section: { marginTop: 20, marginBottom: 8 },
  footer: { marginTop: 24, gap: 12, alignItems: 'center' },
});
