import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { palette } from './theme.ts';

export function DateBadge({ day, month }: { day: string; month: string }) {
  return (
    <View className="w-12 items-center">
      <Text className="font-sans-bold text-[17px] text-ink">{day}</Text>
      <Text className="font-sans text-[12px] uppercase text-muted">{month}</Text>
    </View>
  );
}

export interface ListRowProps {
  left?: ReactNode;
  title: string;
  subtitle?: string;
  subtitleTone?: 'muted' | 'rust' | 'slate' | 'signal';
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
}

const SUB: Record<NonNullable<ListRowProps['subtitleTone']>, string> = {
  muted: 'text-muted font-sans',
  rust: 'text-rust font-sans-semibold',
  slate: 'text-slate font-sans-semibold',
  signal: 'text-signal font-sans-semibold',
};

export function ListRow({ left, title, subtitle, subtitleTone = 'muted', right, chevron, onPress }: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={`min-h-[64px] flex-row items-center gap-3 px-4 py-3 ${onPress ? 'active:bg-paper' : ''}`}
    >
      {left}
      <View className="flex-1">
        <Text className="font-sans-semibold text-[16px] text-ink" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text className={`mt-0.5 text-[12px] ${SUB[subtitleTone]}`} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={palette.muted} /> : null}
    </Pressable>
  );
}

/** White card whose rows are separated by hairlines. */
export function ListCard({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View className="overflow-hidden rounded-[24px] border border-hairline bg-white">
      {rows.map((row, i) => (
        <View key={i} className={i > 0 ? 'border-t border-[#F2F0EA]' : ''}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** Tappable card row with a count badge (Home "New transactions to confirm"). */
export function InboxRow({
  count,
  title,
  subtitle,
  onPress,
}: {
  count: number;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-[24px] border border-hairline bg-white p-4 active:opacity-90"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-peach">
        <Text className="font-sans-bold text-[16px] text-rust">{count}</Text>
      </View>
      <View className="flex-1">
        <Text className="font-sans-semibold text-[16px] text-ink">{title}</Text>
        {subtitle ? <Text className="font-sans mt-0.5 text-[13px] text-muted">{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </Pressable>
  );
}
