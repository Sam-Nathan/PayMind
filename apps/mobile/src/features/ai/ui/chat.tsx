import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { palette } from '../../../components/index.ts';

/** Chat bubble. Assistant text is always rendered as plain text, never markdown. */
export function ChatBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  if (role === 'user') {
    return (
      <View className="max-w-[84%] self-end rounded-[22px] rounded-br-[6px] bg-oxblood px-4 py-3">
        <Text className="font-sans text-[16px] leading-[22px] text-paper">{text}</Text>
      </View>
    );
  }
  return (
    <View className="max-w-[92%] self-start rounded-[22px] rounded-bl-[6px] border border-hairline bg-white px-4 py-3">
      <Text className="font-sans text-[15px] leading-[22px] text-ink" selectable={false}>
        {text}
      </Text>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: native }),
        Animated.timing(v, { toValue: 0.3, duration: 350, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v }} className="h-2 w-2 rounded-pill bg-muted" />;
}

export function TypingDots() {
  return (
    <View accessibilityLabel="PayMind is thinking" className="flex-row items-center gap-1.5 self-start rounded-[22px] rounded-bl-[6px] border border-hairline bg-white px-4 py-4">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

/** Input + round mic button (docked above the tab bar). */
export function Composer({
  value,
  onChangeText,
  onSend,
  onMic,
  disabled,
  placeholder = 'Spent 300 on auto with Neel, split it…',
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const hasText = value.trim().length > 0;
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-14 flex-1 flex-row items-center rounded-[20px] border border-hairline bg-white pl-4 pr-2">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.stone}
          editable={!disabled}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={onSend}
          accessibilityLabel="Message"
          className="font-sans flex-1 text-[16px] text-ink"
          maxLength={2000}
        />
        {hasText ? (
          <Pressable
            onPress={onSend}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Send"
            className="h-10 w-10 items-center justify-center rounded-full bg-ink active:opacity-80"
          >
            <Ionicons name="arrow-up" size={20} color={palette.paper} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={onMic}
        accessibilityRole="button"
        accessibilityLabel="Say an expense"
        className="h-14 w-14 items-center justify-center rounded-[18px] bg-signal active:opacity-90"
      >
        <Ionicons name="mic" size={24} color={palette.white} />
      </Pressable>
    </View>
  );
}
