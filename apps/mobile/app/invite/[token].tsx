import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '@repo/ui';
import { useTheme } from '@repo/ui';

export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const theme = useTheme();
  return (
    <Screen>
      <Card style={styles.card}>
        <Text variant="h2">Invite</Text>
        <Text variant="body" muted>Token: {token}</Text>
        <Button label="Accept" onPress={() => (router.replace as unknown as (s: string) => void)('/home')} full />
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({ card: { gap: 12 } });
