import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, MemberAvatar, avatarColor, palette } from '../../../components/index.ts';

/** Our screens draw their own header (design), so turn the stack's native one off. */
export function HideNativeHeader() {
  return <Stack.Screen options={{ headerShown: false }} />;
}

/** Understand · Split · Settle (components.md StepPills). */
export function StepPills({
  steps,
  active,
  onSelect,
}: {
  steps: readonly string[];
  active: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <View className="flex-row items-center gap-1">
      {steps.map((label, i) => {
        const on = i === active;
        return (
          <Pressable
            key={label}
            onPress={() => onSelect?.(i)}
            disabled={!onSelect || on}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            className={`h-[34px] items-center justify-center rounded-pill px-3.5 ${on ? 'bg-ink' : ''}`}
          >
            <Text className={`font-sans-semibold text-[13px] ${on ? 'text-paper' : 'text-muted'}`}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Member pill with avatar (participant strip). */
export function MemberChip({
  id,
  name,
  isYou,
  selected,
  onPress,
}: {
  id: string;
  name: string;
  isYou?: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      className={`h-11 flex-row items-center gap-2 rounded-pill border bg-white pl-1.5 pr-4 ${
        selected ? 'border-2 border-ink' : 'border-hairline opacity-60'
      }`}
    >
      <MemberAvatar id={id} name={name} isYou={isYou} size={32} />
      <Text className="font-sans-semibold text-[14px] text-ink">{isYou ? 'You' : name}</Text>
    </Pressable>
  );
}

/** Name toggle on an item row; `count` turns it into "You × 2" for quantity items. */
export function PersonToggle({
  id,
  name,
  isYou,
  on,
  count,
  onPress,
}: {
  id: string;
  name: string;
  isYou?: boolean;
  on: boolean;
  count?: number;
  onPress: () => void;
}) {
  const label = `${isYou ? 'You' : name}${count !== undefined ? ` × ${count}` : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      className={`h-9 items-center justify-center rounded-pill px-3.5 ${on ? '' : 'border border-hairline bg-white'}`}
      style={on ? { backgroundColor: avatarColor(id, isYou) } : undefined}
    >
      <Text className={`font-sans-semibold text-[13px] ${on ? 'text-white' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}

/** AI is off: explain and link to Privacy. */
export function AiOffNote({ message }: { message?: string }) {
  const router = useRouter();
  return (
    <View className="rounded-[18px] bg-mist p-4">
      <View className="flex-row items-start gap-3">
        <Ionicons name="shield-checkmark-outline" size={20} color={palette.slate} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-[14px] leading-5 text-slate">
            {message ?? 'AI is off, so PayMind can\'t read bills or sentences for you. Manual entry and plain search still work.'}
          </Text>
          <View className="mt-3 self-start">
            <Button label="Open Privacy & data" variant="outline" size="sm" onPress={() => router.push('/privacy')} />
          </View>
        </View>
      </View>
    </View>
  );
}
