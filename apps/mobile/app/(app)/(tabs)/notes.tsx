import React, { useEffect, useState } from 'react';
import { Alert, RefreshControl, StyleSheet } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { NotebookPen, Plus } from 'lucide-react-native';
import { Button, Card, Input, ListRow, Screen, Text } from '@repo/ui';
import { trpc } from '@repo/api';
import { useAuth } from '@repo/auth';
import { useActiveOrg } from '@repo/organizations';
import { useTheme } from '@/lib/use-theme';
import { flattenPages, matchesSearchQuery, normalizeSearchQuery, sortByField } from '@/lib/list-policy';
import { useTranslation } from 'react-i18next';

type NoteItem = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  body: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type NoteSort = 'newest' | 'oldest';

const SEARCH_DEBOUNCE_MS = 250;

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString();
}

export default function Notes() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const org = useActiveOrg();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<NoteSort>('newest');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(normalizeSearchQuery(search)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const listQuery = useInfiniteQuery({
    queryKey: ['notes', 'list', org?.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      trpc.notes.list.query({ organizationId: org!.id, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!user && !!org,
  });

  const loaded = flattenPages(listQuery.data?.pages ?? []) as NoteItem[];
  const searched = loaded.filter((note) => matchesSearchQuery([note.title, note.body], debouncedSearch));
  const items =
    sort === 'newest' ? searched : sortByField(searched, (note) => new Date(note.createdAt).getTime(), 'asc');

  const showError = () => {
    Alert.alert(t('notes.error'));
  };

  if (!org) {
    return (
      <Screen>
        <Text variant="h1">{t('notes.title')}</Text>
        <Card style={styles.empty}>
          <NotebookPen color={theme.textMuted} size={28} />
          <Text variant="body" muted>{t('notes.noOrganization')}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
          onRefresh={() => void listQuery.refetch()}
        />
      }
    >
      <Text variant="h1">{t('notes.title')}</Text>
      <Button
        label={t('notes.newNote')}
        icon={<Plus color={theme.primaryForeground} size={18} />}
        onPress={() => router.push('/notes/new')}
      />
      <Input
        placeholder={t('notes.searchNotes')}
        value={search}
        onChangeText={setSearch}
        accessibilityLabel={t('notes.searchNotes')}
      />
      <Button
        label={sort === 'newest' ? t('notes.newestFirst') : t('notes.oldestFirst')}
        size="md"
        variant="ghost"
        onPress={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
      />
      {listQuery.isLoading ? <Text variant="body" muted>{t('common.loading')}</Text> : null}
      {listQuery.error ? (
        <Card style={styles.empty}>
          <Text variant="body" color={theme.danger}>{t('notes.error')}</Text>
          <Button label={t('home.refresh')} size="md" variant="secondary" onPress={() => void listQuery.refetch().catch(showError)} />
        </Card>
      ) : null}
      {!listQuery.isLoading && !listQuery.error && loaded.length === 0 ? (
        <Card style={styles.empty}>
          <NotebookPen color={theme.textMuted} size={28} />
          <Text variant="body" muted>{t('notes.noNotes')}</Text>
        </Card>
      ) : null}
      {!listQuery.isLoading && !listQuery.error && loaded.length > 0 && items.length === 0 ? (
        <Card style={styles.empty}>
          <Text variant="body" muted>{t('notes.noMatchingNotes')}</Text>
        </Card>
      ) : null}
      {items.map((note) => (
        <Card key={note.id} style={styles.item} onPress={() => router.push(`/notes/${note.id}`)}>
          <ListRow
            leading={<NotebookPen color={theme.textMuted} size={20} />}
            title={note.title}
            subtitle={formatDate(note.createdAt)}
          />
        </Card>
      ))}
      {listQuery.hasNextPage ? (
        <Button
          label={t('notes.loadMore')}
          variant="secondary"
          loading={listQuery.isFetchingNextPage}
          onPress={() => void listQuery.fetchNextPage().catch(showError)}
          full
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 8, marginTop: 24 },
  item: { marginTop: 10, paddingVertical: 2 },
});
