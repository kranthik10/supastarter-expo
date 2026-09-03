import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Button, Card, Input, Screen, Text } from '@repo/ui';
import { trpc } from '@repo/api';
import { useActiveOrg } from '@repo/organizations';
import { useTranslation } from 'react-i18next';

const TITLE_MAX = 120;
const BODY_MAX = 4000;

export default function NewNote() {
  const { t } = useTranslation();
  const router = useRouter();
  const org = useActiveOrg();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: { title: string; body?: string }) =>
      trpc.notes.create.mutate({ organizationId: org!.id, ...input }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      router.replace(`/notes/${result.note.id}`);
    },
    onError: () => setError(t('notes.actionFailed')),
  });

  const save = () => {
    const cleanTitle = title.trim();
    if (cleanTitle.length === 0 || cleanTitle.length > TITLE_MAX || body.trim().length > BODY_MAX) {
      setError(t('notes.actionFailed'));
      return;
    }
    setError(null);
    const trimmedBody = body.trim();
    createMutation.mutate(trimmedBody ? { title: cleanTitle, body: trimmedBody } : { title: cleanTitle });
  };

  if (!org) {
    return (
      <Screen>
        <Text variant="h1">{t('notes.newNote')}</Text>
        <Card style={styles.empty}>
          <Text variant="body" muted>{t('notes.noOrganization')}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="h1">{t('notes.newNote')}</Text>
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
        {error ? <Text variant="small" color="#b3261e">{error}</Text> : null}
        <Button label={t('notes.create')} loading={createMutation.isPending} onPress={save} />
        <Button
          label={t('common.back')}
          variant="ghost"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/notes');
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 12, gap: 4 },
  empty: { alignItems: 'center', gap: 8, marginTop: 24 },
});
