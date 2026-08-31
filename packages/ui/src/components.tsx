import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './use-theme';
import { radius, typography } from './theme';

/* ---------- Text ---------- */

type TextProps = {
  children?: React.ReactNode;
  variant?: keyof typeof typography;
  color?: string;
  muted?: boolean;
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<TextStyle>;
};

export function Text({ children, variant = 'body', color, muted, align }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      style={[
        typography[variant],
        { color: color ?? (muted ? theme.textMuted : theme.text), textAlign: align },
      ]}
    >
      {children}
    </RNText>
  );
}

/* ---------- Screen ---------- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 };
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }, pad]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView contentContainerStyle={[padded && styles.padded, styles.grow]} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[padded && styles.padded, styles.grow]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/* ---------- Button ---------- */

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
  size?: 'md' | 'lg';
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  full,
  size = 'lg',
}: ButtonProps) {
  const theme = useTheme();
  const bg =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.danger
        : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger' ? theme.primaryForeground : theme.text;
  const height = size === 'lg' ? 52 : 44;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { height, backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.border },
        (disabled || loading) && { opacity: 0.6 },
        full && styles.full,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <RNText style={[typography.h3, { color: fg }]}>{label}</RNText>
        </View>
      )}
    </Pressable>
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const theme = useTheme();
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && { opacity: 0.9 },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

/* ---------- Input ---------- */

type InputProps = TextInputProps & {
  label?: string;
  error?: string | null;
};

export function Input({ label, error, ...props }: InputProps) {
  const theme = useTheme();
  return (
    <View style={styles.inputWrap}>
      {label ? (
        <RNText style={[typography.small, { color: theme.textMuted, marginBottom: 6 }]}>
          {label}
        </RNText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
          },
        ]}
      />
      {error ? (
        <RNText style={[typography.small, { color: theme.danger, marginTop: 6 }]}>{error}</RNText>
      ) : null}
    </View>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({ 
  name, 
  color, 
  size = 40, 
  image 
}: { 
  name: string; 
  color?: string; 
  size?: number; 
  image?: string;
}) {
  if (image) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.full,
          overflow: 'hidden',
        }}
      >
        <Image source={{ uri: image }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
      </View>
    );
  }
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: color ?? '#888',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</RNText>
    </View>
  );
}

import { Image } from 'react-native';

/* ---------- Badge ---------- */

export function Badge({ label, tone = 'brand' }: { label: string; tone?: 'brand' | 'success' | 'muted' | 'amber' }) {
  const theme = useTheme();
  const map = {
    brand: { bg: theme.primary + '22', fg: theme.dark ? '#93b4fd' : '#1d40d8' },
    success: { bg: '#10b98122', fg: theme.dark ? '#4ade80' : '#15803d' },
    amber: { bg: '#f59e0b22', fg: theme.dark ? '#fbbf24' : '#92400e' },
    muted: { bg: theme.surfaceAlt, fg: theme.textMuted },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <RNText style={{ color: map.fg, fontSize: 12, fontWeight: '600' }}>{label}</RNText>
    </View>
  );
}

/* ---------- SegmentedControl ---------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.surfaceAlt }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: theme.surface }, styles.segmentActive]}
          >
            <RNText
              style={{
                color: active ? theme.text : theme.textMuted,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              {o.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- ListRow ---------- */

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
    >
      {leading}
      <View style={styles.flex1}>
        <RNText style={[typography.h3, { color: theme.text }]}>{title}</RNText>
        {subtitle ? (
          <RNText style={[typography.small, { color: theme.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </RNText>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  flex1: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { paddingHorizontal: 20 },
  full: { alignSelf: 'stretch', width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    alignSelf: 'auto',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 4,
  },
  inputWrap: { marginBottom: 14 },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentActive: {},
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
});
