import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Badge, Button, Card, ListRow, Screen, Text } from '@repo/ui';
import { trpc } from '@repo/api';
import { useAuth } from '@repo/auth';
import { parseNotificationData, type NotificationCategory } from '@repo/notifications/policy';
import { useTheme } from '@/lib/use-theme';
import { useTranslation } from 'react-i18next';

type NotificationItem = {
  id: string;
  organizationId: string | null;
  category: NotificationCategory;
  title: string;
  body: string | null;
  data: { route?: string; orgId?: string } | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

function isRead(item: NotificationItem): boolean {
  return item.readAt !== null;
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString();
}

export default function Notifications() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();
  const listQuery = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => trpc.notifications.list.query({ limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!user,
  });
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => trpc.notifications.getUnreadCount.query(),
    enabled: !!user,
  });
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => trpc.notifications.markRead.mutate({ notificationId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => trpc.notifications.markAllRead.mutate(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const items = (listQuery.data?.pages.flatMap((page) => page.items) ?? []) as NotificationItem[];
  const openNotification = (item: NotificationItem) => {
    if (!isRead(item)) void markReadMutation.mutateAsync(item.id).catch(() => undefined);
    const data = parseNotificationData(item.data);
    if (data?.route) (router.push as unknown as (path: string) => void)(data.route);
  };

  const showError = (error: unknown) => {
    Alert.alert(t('notifications.error'), error instanceof Error ? error.message : t('notifications.error'));
  };

  return (
    <Screen>
      <Text variant="h1">{t('notifications.title')}</Text>
      <Text variant="body" muted>{t('notifications.unread', { count: unreadQuery.data?.count ?? 0 })}</Text>
      <Button
        label={t('notifications.markAllRead')}
        variant="ghost"
        loading={markAllReadMutation.isPending}
        disabled={items.every(isRead)}
        onPress={() => void markAllReadMutation.mutateAsync().catch(showError)}
      />
      {listQuery.isLoading ? <Text variant="body" muted>{t('common.loading')}</Text> : null}
      {listQuery.error ? <Text variant="body" color={theme.danger}>{t('notifications.error')}</Text> : null}
      {!listQuery.isLoading && !listQuery.error && items.length === 0 ? (
        <Card style={styles.empty}>
          <Bell color={theme.textMuted} size={28} />
          <Text variant="body" muted>{t('notifications.empty')}</Text>
        </Card>
      ) : null}
      {items.map((item) => (
        <Card key={item.id} style={[styles.item, !isRead(item) && { borderColor: theme.primary }]} onPress={() => openNotification(item)}>
          <ListRow
            leading={<Bell color={isRead(item) ? theme.textMuted : theme.primary} size={20} />}
            title={item.title}
            subtitle={[item.body, formatDate(item.createdAt)].filter(Boolean).join(' · ')}
            trailing={!isRead(item) ? <Badge label={t('notifications.new')} tone="brand" /> : null}
          />
        </Card>
      ))}
      {listQuery.hasNextPage ? (
        <Button label={t('notifications.loadMore')} variant="secondary" loading={listQuery.isFetchingNextPage} onPress={() => void listQuery.fetchNextPage().catch(showError)} full />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 8, marginTop: 24 },
  item: { marginTop: 10, paddingVertical: 2 },
});
