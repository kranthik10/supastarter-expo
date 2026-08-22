import React, { useState } from 'react';
import { View, StyleSheet, Alert, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2 } from 'lucide-react-native';
import { Screen, Card, Text, Input, Button, Avatar, Badge, ListRow } from '../../../ui';
import { useTheme } from '../../../lib/use-theme';
import { useAuth, validateEmail } from '../../../lib/auth-store';
import { useActiveOrg, useOrgs, type MemberRole } from '../../../lib/org-store';

export default function Team() {
  const theme = useTheme();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user)!;
  const org = useActiveOrg();
  const inviteMember = useOrgs((s) => s.inviteMember);
  const removeMember = useOrgs((s) => s.removeMember);
  const createOrg = useOrgs((s) => s.createOrg);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<MemberRole, 'owner'>>('member');
  const [error, setError] = useState<string | null>(null);

  if (!org) {
    return (
      <Screen>
        <Text variant="h1">{t('team.title')}</Text>
        <Card style={{ marginTop: 16 }}>
          <Button
            label={t('team.createOrg')}
            onPress={() => createOrg(`${user.name.split(' ')[0]}'s Org`, user)}
          />
        </Card>
      </Screen>
    );
  }

  const invite = () => {
    if (!validateEmail(email)) return setError(t('auth.invalidEmail'));
    setError(null);
    inviteMember(org.id, email.trim(), role);
    Alert.alert(t('team.memberAdded', { email: email.trim() }));
    setEmail('');
  };

  const confirmRemove = (userId: string, memberRole: MemberRole) => {
    if (memberRole === 'owner') {
      return Alert.alert(t('team.cannotRemoveOwner'));
    }
    removeMember(org.id, userId);
  };

  const roleLabel = (r: MemberRole) => t(`team.${r}`);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="h1">🏢 {org.name}</Text>
          <Text variant="body" muted>
            {t('team.subtitle', { count: org.members.length })}
          </Text>
        </View>
      </View>

      <Card style={styles.card}>
        <Text variant="h3">{t('team.invite')}</Text>
        <Input
          label={t('team.inviteEmail')}
          placeholder="jane@acme.com"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          error={error}
        />
        <View style={styles.rolePicker}>
          {(['admin', 'member'] as const).map((r) => (
            <Button
              key={r}
              label={roleLabel(r)}
              size="md"
              variant={role === r ? 'primary' : 'secondary'}
              onPress={() => setRole(r)}
            />
          ))}
        </View>
        <Button label={t('team.invite')} icon={<UserPlus color={theme.primaryForeground} size={18} />} onPress={invite} />
      </Card>

      <Card style={styles.members}>
        {org.members.map((m) => (
          <ListRow
            key={m.userId}
            leading={<Avatar name={m.name} color={m.avatarColor} />}
            title={m.name}
            subtitle={m.email}
            trailing={
              <View style={styles.trailing}>
                <Badge label={roleLabel(m.role)} tone={m.role === 'owner' ? 'brand' : 'muted'} />
                {m.role !== 'owner' ? (
                  <Pressable hitSlop={8} onPress={() => confirmRemove(m.userId, m.role)}>
                    <Trash2 color={theme.danger} size={18} />
                  </Pressable>
                ) : null}
              </View>
            }
          />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 20 },
  card: { gap: 4 },
  rolePicker: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  members: { marginTop: 12 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
