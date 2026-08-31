import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@repo/auth';
import { useOrgs } from '@repo/organizations';

export default function AppLayout() {
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated) && useOrgs((s) => s.hydrated);

  if (!hydrated) return null;

  if (!user) return <Redirect href="/sign-in" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
