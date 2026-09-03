import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '@repo/ui';
import { useAuth } from '@repo/auth';
import { trpc } from '@repo/api';
import { useOrgs } from '@repo/organizations';
import { storePendingLink } from '@/lib/linking';

export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const refreshOrganizations = useOrgs((state) => state.refreshOrganizations);
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const goToSignIn = async () => {
    if (token) await storePendingLink(`/invite/${token}`);
    (router.replace as unknown as (path: string) => void)('/sign-in');
  };

  const accept = async () => {
    if (!token) {
      setMessage('This invitation link is invalid.');
      return;
    }
    setLoading('accept');
    setMessage(null);
    try {
      await trpc.invitations.accept.mutate({ token });
      await refreshOrganizations();
      (router.replace as unknown as (path: string) => void)('/home');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to accept invitation.');
    } finally {
      setLoading(null);
    }
  };

  const decline = async () => {
    if (!token) {
      setMessage('This invitation link is invalid.');
      return;
    }
    setLoading('decline');
    setMessage(null);
    try {
      await trpc.invitations.decline.mutate({ token });
      setMessage('Invitation declined.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to decline invitation.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Screen>
      <Card style={styles.card}>
        <Text variant="h2">Organization invitation</Text>
        <Text variant="body" muted>
          {user ? `This invitation is for ${user.email}.` : 'Sign in with the invited email address to continue.'}
        </Text>
        {message ? <Text variant="small" color="#b91c1c">{message}</Text> : null}
        {user ? (
          <View style={styles.actions}>
            <Button label="Accept" onPress={() => void accept()} loading={loading === 'accept'} full />
            <Button label="Decline" variant="secondary" onPress={() => void decline()} loading={loading === 'decline'} full />
          </View>
        ) : (
          <Button label="Sign in" onPress={() => void goToSignIn()} full />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { gap: 12 }, actions: { gap: 8 } });
