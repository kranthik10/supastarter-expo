import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, RefreshCw } from 'lucide-react-native';
import { Screen, Card, Text, Input, Button, Avatar, Badge, ListRow } from '@repo/ui';
import { useTheme } from '@/lib/use-theme';
import { useAuth, validateEmail } from '@repo/auth';
import { useActiveOrg, useOrgs, type MemberRole } from '@repo/organizations';
import { matchesSearchQuery, normalizeSearchQuery, sortByField, type SortDirection } from '@/lib/list-policy';

type RoleFilter = 'all' | MemberRole;

const SEARCH_DEBOUNCE_MS = 250;

export default function Team() {
  const theme = useTheme();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const org = useActiveOrg();
  const orgs = useOrgs((s) => s.orgs);
  const setActiveOrg = useOrgs((s) => s.setActiveOrg);
  const queryClient = useQueryClient();
  const refreshMembers = useOrgs((s) => s.refreshMembers);
  const refreshInvitations = useOrgs((s) => s.refreshInvitations);
  const inviteMember = useOrgs((s) => s.inviteMember);
  const revokeInvitation = useOrgs((s) => s.revokeInvitation);
  const removeMember = useOrgs((s) => s.removeMember);
  const updateMemberRole = useOrgs((s) => s.updateMemberRole);
  const transferOwnership = useOrgs((s) => s.transferOwnership);
  const createOrg = useOrgs((s) => s.createOrg);
  const pendingInvitations = useOrgs((s) => (org ? s.pendingInvitationsByOrg[org.id] ?? [] : []));

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<MemberRole, 'owner'>>('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(normalizeSearchQuery(search)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!org) return;
    void Promise.all([refreshMembers(org.id), refreshInvitations(org.id)]).catch(() => {
      // The server remains authoritative; cached members stay visible on refresh failure.
    });
  }, [org?.id, refreshMembers, refreshInvitations]);

  const visibleMembers = useMemo(() => {
    const members = org?.members ?? [];
    const filtered = members.filter(
      (m) =>
        (roleFilter === 'all' || m.role === roleFilter) &&
        matchesSearchQuery([m.name, m.email], debouncedSearch),
    );
    return sortByField(filtered, (m) => (m.name ?? m.email).toLowerCase(), sortDirection);
  }, [org?.members, roleFilter, debouncedSearch, sortDirection]);

  if (!org) {
    const createDefaultOrg = () => {
      const name = `${user?.name?.split(' ')[0] ?? t('common.user')}'s Org`;
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      void createOrg(name, slug).catch((e: unknown) => Alert.alert(t('team.actionFailed', { reason: e instanceof Error ? e.message : 'unknown_error' })));
    };
    return (
      <Screen>
        <Text variant="h1">{t('team.title')}</Text>
        <Card style={{ marginTop: 16 }}>
          <Button label={t('team.createOrg')} onPress={createDefaultOrg} />
        </Card>
      </Screen>
    );
  }

  const currentRole = org.members?.find((member) => member.userId === user?.id)?.role;
  const canInvite = currentRole === 'owner' || currentRole === 'admin';
  const canUpdateRoles = currentRole === 'owner';

  const showActionError = (e: unknown) => {
    const reason = e instanceof Error ? e.message : 'unknown_error';
    Alert.alert(t('team.actionFailed', { reason }));
  };

  const invite = async () => {
    if (!validateEmail(email)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setError(null);
    setBusy('invite');
    try {
      const result = await inviteMember(org.id, email.trim(), role);
      Alert.alert(result.emailDelivered ? t('team.memberAdded', { email: email.trim() }) : t('team.emailNotConfigured'));
      setEmail('');
    } catch (e) {
      showActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = (userId: string, memberRole: MemberRole) => {
    if (memberRole === 'owner') {
      Alert.alert(t('team.cannotRemoveOwner'));
      return;
    }
    Alert.alert(t('team.remove'), t('team.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('team.remove'),
        style: 'destructive',
        onPress: () => {
          setBusy(`remove:${userId}`);
          void removeMember(org.id, userId).catch(showActionError).finally(() => setBusy(null));
        },
      },
    ]);
  };

  const changeRole = (userId: string, memberRole: MemberRole) => {
    if (!canUpdateRoles || memberRole === 'owner') return;
    const nextRole: Exclude<MemberRole, 'owner'> = memberRole === 'admin' ? 'member' : 'admin';
    setBusy(`role:${userId}`);
    void updateMemberRole(org.id, userId, nextRole)
      .then(() => Alert.alert(t('team.roleUpdated')))
      .catch(showActionError)
      .finally(() => setBusy(null));
  };

  const confirmTransfer = (userId: string, name: string) => {
    Alert.alert(t('team.transferOwnership'), t('team.transferConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('team.transferOwnership'),
        onPress: () => {
          setBusy(`transfer:${userId}`);
          void transferOwnership(org.id, userId).catch(showActionError).finally(() => setBusy(null));
        },
      },
    ]);
  };

  const revoke = (invitationId: string) => {
    setBusy(`revoke:${invitationId}`);
    void revokeInvitation(org.id, invitationId).catch(showActionError).finally(() => setBusy(null));
  };

  const roleLabel = (r: MemberRole) => t(`team.${r}`);
  const displayName = (name: string | null | undefined, memberEmail: string) => name ?? memberEmail.split('@')[0] ?? t('common.user');

  const switchOrg = (id: string) => {
    if (id === org.id) return;
    setActiveOrg(id);
    // Org-keyed queries refetch under the new org; invalidating everything
    // guarantees no stale list, billing, or overview data survives the switch.
    void queryClient.invalidateQueries();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="h1">🏢 {org.name}</Text>
          <Text variant="body" muted>
            {t('team.subtitle', { count: org.members?.length ?? 0 })}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('team.refresh')} onPress={() => void Promise.all([refreshMembers(org.id), refreshInvitations(org.id)]).catch(showActionError)}>
          <RefreshCw color={theme.primary} size={20} />
        </Pressable>
      </View>

      {orgs.length > 1 ? (
        <Card style={styles.card}>
          <Text variant="h3">{t('team.switchWorkspace')}</Text>
          {orgs.map((o) => {
            const active = o.id === org.id;
            return (
              <ListRow
                key={o.id}
                title={o.name}
                subtitle={o.slug}
                onPress={active ? undefined : () => switchOrg(o.id)}
                trailing={active ? <Badge label={t('team.current')} tone="brand" /> : undefined}
              />
            );
          })}
        </Card>
      ) : null}

      {canInvite ? (
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
          <Button
            label={t('team.invite')}
            icon={<UserPlus color={theme.primaryForeground} size={18} />}
            onPress={() => void invite()}
            loading={busy === 'invite'}
          />
        </Card>
      ) : null}

      <Card style={styles.members}>
        <Input
          placeholder={t('team.searchMembers')}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={t('team.searchMembers')}
        />
        <View style={styles.filterRow}>
          {(['all', 'owner', 'admin', 'member'] as const).map((f) => (
            <Button
              key={f}
              label={f === 'all' ? t('team.filterAll') : roleLabel(f)}
              size="md"
              variant={roleFilter === f ? 'primary' : 'secondary'}
              onPress={() => setRoleFilter(f)}
            />
          ))}
          <Button
            label={sortDirection === 'asc' ? t('team.sortAZ') : t('team.sortZA')}
            size="md"
            variant="ghost"
            onPress={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />
        </View>
        {visibleMembers.length === 0 ? (
          <Text variant="small" muted>{t('team.noMatchingMembers')}</Text>
        ) : null}
        {visibleMembers.map((m) => (
          <ListRow
            key={m.userId}
            leading={<Avatar name={displayName(m.name, m.email)} image={m.image ?? undefined} />}
            title={displayName(m.name, m.email)}
            subtitle={m.email}
            trailing={
              <View style={styles.trailing}>
                <Badge label={roleLabel(m.role)} tone={m.role === 'owner' ? 'brand' : 'muted'} />
                {canUpdateRoles && m.role !== 'owner' ? (
                  <Button
                    label={roleLabel(m.role === 'admin' ? 'member' : 'admin')}
                    size="md"
                    variant="ghost"
                    loading={busy === `role:${m.userId}`}
                    onPress={() => changeRole(m.userId, m.role)}
                  />
                ) : null}
                {canInvite && m.role !== 'owner' ? (
                  <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={t('team.remove')} onPress={() => confirmRemove(m.userId, m.role)}>
                    <Trash2 color={theme.danger} size={18} />
                  </Pressable>
                ) : null}
                {currentRole === 'owner' && m.role !== 'owner' ? (
                  <Button
                    label={t('team.transferOwnership')}
                    size="md"
                    variant="ghost"
                    loading={busy === `transfer:${m.userId}`}
                    onPress={() => confirmTransfer(m.userId, displayName(m.name, m.email))}
                  />
                ) : null}
              </View>
            }
          />
        ))}
      </Card>

      <Card style={styles.pending}>
        <Text variant="h3">{t('team.pending')}</Text>
        {pendingInvitations.length === 0 ? <Text variant="small" muted>{t('team.noPending')}</Text> : null}
        {pendingInvitations.map((invitation) => (
          <ListRow
            key={invitation.id}
            title={invitation.email}
            subtitle={roleLabel(invitation.role)}
            trailing={canInvite ? (
              <Button
                label={t('team.revoke')}
                size="md"
                variant="ghost"
                loading={busy === `revoke:${invitation.id}`}
                onPress={() => revoke(invitation.id)}
              />
            ) : <Badge label={t('team.pending')} tone="amber" />}
          />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 20 },
  headerText: { flex: 1 },
  card: { gap: 4 },
  rolePicker: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  members: { marginTop: 12 },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 8 },
  pending: { marginTop: 12, gap: 4 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
});
