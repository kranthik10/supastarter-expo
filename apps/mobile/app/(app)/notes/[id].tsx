import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Input, Screen, Text } from '@repo/ui';
import { trpc } from '@repo/api';
import { useAuth } from '@repo/auth';
import { useActiveOrg } from '@repo/organizations';
import { useTheme } from '@/lib/use-theme';
import { useTranslation } from 'react-i18next';

const TITLE_MAX = 120;
const BODY_MAX = 4000;

export default function NoteDetail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const org = useActiveOrg();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['notes', 'detail', org?.id, id],
    queryFn: () => trpc.notes.get.query({ organizationId: org!.id, noteId: id! }),
    enabled: !!org && typeof id === 'string',
  });

  useEffect(() => {
    const note = detailQuery.data?.note;
    if (note && hydratedFor !== note.id) {
      setTitle(note.title);
      setBody(note.body ?? '');
      setHydratedFor(note.id);
    }
  }, [detailQuery.data, hydratedFor]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notes'] });
  };

  const updateMutation = useMutation({
    mutationFn: (input: { title: string; body?: string }) =>
      trpc.notes.update.mutate({ organizationId: org!.id, noteId: id!, ...input }),
    onSuccess: () => {
      invalidate();
      Alert.alert(t('notes.noteSaved'));
    },
    onError: () => setError(t('notes.actionFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => trpc.notes.delete.mutate({ organizationId: org!.id, noteId: id! }),
    onSuccess: () => {
      invalidate();
      Alert.alert(t('notes.noteDeleted'));
      router.back();
    },
    onError: () => setError(t('notes.actionFailed')),
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/notes');
  };

  const save = () => {
    const cleanTitle = title.trim();
    if (cleanTitle.length === 0 || cleanTitle.length > TITLE_MAX || body.trim().length > BODY_MAX) {
      setError(t('notes.actionFailed'));
      return;
    }
    setError(null);
    const trimmedBody = body.trim();
    updateMutation.mutate(trimmedBody ? { title: cleanTitle, body: trimmedBody } : { title: cleanTitle, body: '' });
  };

  const confirmDelete = () => {
    Alert.alert(t('notes.deleteNote'), t('notes.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('notes.deleteNote'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const currentRole = org?.members?.find((m) => m.userId === user?.id)?.role;
  // Presentation gate only; the server re-checks notes.delete on every call.
  const canDelete = currentRole === 'owner' || currentRole === 'admin';

  return (
    <Screen>
      <Text variant="h1">{t('notes.editNote')}</Text>
      {detailQuery.isLoading ? <Text variant="body" muted>{t('common.loading')}</Text> : null}
      {detailQuery.error ? (
        <Card style={styles.empty}>
          <Text variant="body" color={theme.danger}>{t('notes.error')}</Text>
          <Button label={t('common.back')} size="md" variant="secondary" onPress={goBack} />
        </Card>
      ) : null}
      {detailQuery.data ? (
        <Card style={styles.form}>
          <Input
            label={t('notes.titleLabel')}
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            accessibilityLabel={t('notes.titleLabel')}
          />
          <Input
            label={t('notes.bodyLabel')}
            value={body}
            onChangeText={setBody}
            maxLength={BODY_MAX}
            multiline
            numberOfLines={6}
            accessibilityLabel={t('notes.bodyLabel')}
          />
          {error ? <Text variant="small" color={theme.danger}>{error}</Text> : null}
          <Button label={t('notes.save')} loading={updateMutation.isPending} onPress={save} />
          {canDelete ? (
            <Button
              label={t('notes.deleteNote')}
              variant="danger"
              loading={deleteMutation.isPending}
              onPress={confirmDelete}
            />
          ) : null}
          <Button label={t('common.back')} variant="ghost" onPress={goBack} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 12, gap: 4 },
  empty: { alignItems: 'center', gap: 8, marginTop: 24 },
});
