import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter, Slot } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@repo/ui';
import { useTheme } from '@repo/ui';

export default function MarketingLayout() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.replace('/')} hitSlop={8}>
          <Text variant="h2" color={theme.primary}>
            ⚡ supastarter
          </Text>
        </Pressable>
        <Button
          label="Sign in"
          size="md"
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
      </View>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
