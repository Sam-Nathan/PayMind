import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { palette, type IconName } from './theme.ts';

export type OverlineTone = 'muted' | 'steel' | 'peach' | 'clay' | 'rust' | 'signal' | 'oxblood' | 'ink' | 'paper';
const OVERLINE: Record<OverlineTone, string> = {
  muted: 'text-muted',
  steel: 'text-steel',
  peach: 'text-peach',
  clay: 'text-clay',
  rust: 'text-rust',
  signal: 'text-signal',
  oxblood: 'text-oxblood',
  ink: 'text-ink',
  paper: 'text-paper',
};

/** UPPERCASE 12px label with tracking. */
export function Overline({
  children,
  tone = 'muted',
  icon,
}: {
  children: ReactNode;
  tone?: OverlineTone;
  icon?: IconName;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      {icon ? <Ionicons name={icon} size={14} color={palette[tone === 'paper' ? 'paper' : (tone as keyof typeof palette)]} /> : null}
      <Text className={`font-sans-semibold text-[12px] uppercase tracking-[1.3px] ${OVERLINE[tone]}`}>
        {children}
      </Text>
    </View>
  );
}

/** Section title with an optional right-hand action or meta text. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  meta,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  meta?: string;
}) {
  return (
    <View className="mb-3 mt-6 flex-row items-center justify-between">
      <Text className="font-sans-bold text-[18px] text-ink">{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={8}>
          <Text className="font-sans-semibold text-[14px] text-signal">{actionLabel}</Text>
        </Pressable>
      ) : meta ? (
        <Text className="font-sans text-[13px] text-muted">{meta}</Text>
      ) : null}
    </View>
  );
}
