import React from 'react';
import { View, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SendHorizonal } from 'lucide-react-native';
import { Screen, Text, Avatar } from '@repo/ui';
import { useTheme } from '@repo/ui';
import { useAuth } from '@repo/auth';
import { streamChat, type ChatMessage as AiMessage } from '@repo/ai';

type UiMessage = AiMessage & { id: string };

export default function Assistant() {
  const theme = useTheme();
  const user = useAuth((s) => s.user);

  const [messages, setMessages] = React.useState<UiMessage[]>([
    { id: 'welcome', role: 'assistant', content: 'Hi! Ask me anything.' },
  ]);
  const [input, setInput] = React.useState('');
  const [streaming, setStreaming] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const send = async () => {
    const content = input.trim();
    if (!content || streaming) return;
    setInput('');
    setStreaming(true);

    const history: AiMessage[] = [
      ...messages.map((m): AiMessage => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];
    setMessages((m) => [
      ...m,
      { id: `u_${Date.now()}`, role: 'user', content },
      { id: `a_${Date.now()}`, role: 'assistant', content: '' },
    ]);

    abortRef.current = new AbortController();
    try {
      for await (const token of streamChat(history, { signal: abortRef.current.signal })) {
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + token };
          return next;
        });
      }
    } finally {
      setStreaming(false);
    }
  };

  const displayName = user?.name ?? user?.email?.split('@')[0] ?? 'User';

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text variant="h2">🤖 Assistant</Text>
        </View>
        <View style={styles.list}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={[styles.bubbleRow, styles.end]}>
                <View style={[styles.bubble, styles.userBubble, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: theme.primaryForeground }}>{m.content}</Text>
                </View>
                <Avatar name={displayName} image={user?.image ?? undefined} size={30} />
              </View>
            ) : (
              <View key={m.id} style={[styles.bubbleRow, styles.start]}>
                <Avatar name="AI" color="#8b5cf6" size={30} />
                <View style={[styles.bubble, styles.aiBubble, { backgroundColor: theme.surface }]}>
                  <Text>{m.content || '…'}</Text>
                </View>
              </View>
            )
          )}
        </View>
        <View style={[styles.inputRow, { borderColor: theme.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            placeholder="Type a message…"
            placeholderTextColor={theme.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void send()}
            editable={!streaming}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void send()}
            disabled={streaming || !input.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: theme.primary, opacity: pressed || !input.trim() ? 0.6 : 1 },
            ]}
          >
            <SendHorizonal color={theme.primaryForeground} size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { marginTop: 8, marginBottom: 12 },
  list: { flex: 1, gap: 10 },
  bubbleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  start: { justifyContent: 'flex-start' },
  end: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  userBubble: { borderBottomRightRadius: 4 },
  aiBubble: { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  input: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
