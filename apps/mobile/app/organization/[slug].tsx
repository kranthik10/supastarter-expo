import React from 'react';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, Screen, Text } from '@repo/ui';

export default function Organization() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <Screen>
      <Card style={styles.card}>
        <Text variant="h2">Organization: {slug}</Text>
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({ card: { gap: 12 } });
