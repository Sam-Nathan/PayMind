import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, ChipGroup, IconButton } from '../../components/index.ts';
import { usePrivacySettings } from '../../features/capture/data.ts';
import {
  aiErrorCopy,
  isAiDisabled,
  useAssistant,
  type AssistantMessage,
  type AssistantProposal,
} from '../../data/ai.ts';
import { toPlainText } from '../../features/ai/text.ts';
import { AiOffNote } from '../../features/ai/ui/chrome.tsx';
import { ChatBubble, Composer, TypingDots } from '../../features/ai/ui/chat.tsx';
import { ProposalView } from '../../features/ai/ui/ProposalView.tsx';

const SUGGESTIONS = ['Who owes me money?', 'Goa trip cost?', 'Why is spending up?', 'Subscriptions total'];
const GREETING = 'Ask me about your money, or tell me an expense.';

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  proposals?: AssistantProposal[];
}

let nextId = 1;
const newId = () => `m${nextId++}`;

export default function AskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const privacy = usePrivacySettings();
  const assistant = useAssistant();
  const scroll = useRef<ScrollView>(null);
  const autoSent = useRef<string | null>(null);

  // History lives in memory only: it is gone when the app closes.
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState('');
  const [aiOff, setAiOff] = useState(false);

  const disabled = privacy.data ? !privacy.data.ai_enabled || aiOff : aiOff;
  const sending = assistant.isPending;

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending || disabled) return;
      const userItem: ChatItem = { id: newId(), role: 'user', text };
      setDraft('');
      setItems((prev) => [...prev, userItem]);
      const history: AssistantMessage[] = [...items, userItem].map((m) => ({ role: m.role, content: m.text }));
      try {
        const res = await assistant.mutateAsync(history);
        setItems((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', text: toPlainText(res.reply) || 'Done.', proposals: res.proposals ?? [] },
        ]);
      } catch (e) {
        if (isAiDisabled(e)) setAiOff(true);
        setItems((prev) => [...prev, { id: newId(), role: 'assistant', text: aiErrorCopy(e) }]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, sending, disabled],
  );

  // "Ask a follow-up" from Search arrives with ?q=...
  useEffect(() => {
    const text = typeof q === 'string' ? q.trim() : '';
    if (text && autoSent.current !== text && privacy.isSuccess) {
      autoSent.current = text;
      void send(text);
    }
  }, [q, privacy.isSuccess, send]);

  const empty = items.length === 0;

  return (
    <KeyboardAvoidingView className="flex-1 bg-paper" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-row items-start justify-between px-4" style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-1 pr-3">
          <Text className="font-sans-bold text-[28px] leading-[34px] text-ink">Ask PayMind</Text>
          <Text className="font-sans text-[15px] text-muted">Asks before changing anything</Text>
        </View>
        <IconButton icon="search" label="Search your money" onPress={() => router.push('/search')} />
      </View>

      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {disabled ? <AiOffNote message="AI is off. Manual entry and plain search only." /> : null}
        {empty ? <ChatBubble role="assistant" text={GREETING} /> : null}
        {items.map((m) => (
          <View key={m.id} className="gap-3">
            <ChatBubble role={m.role} text={m.text} />
            {m.proposals?.map((p) => <ProposalView key={p.id} proposal={p} />)}
          </View>
        ))}
        {sending ? <TypingDots /> : null}
      </ScrollView>

      <View className="gap-3 px-4 pt-2" style={{ paddingBottom: 12 }}>
        {empty ? (
          <ChipGroup>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} disabled={disabled || sending} onPress={() => void send(s)} />
            ))}
          </ChipGroup>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} disabled={disabled || sending} onPress={() => void send(s)} />
            ))}
          </ScrollView>
        )}
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={() => void send(draft)}
          onMic={() => router.push('/voice')}
          disabled={disabled}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
