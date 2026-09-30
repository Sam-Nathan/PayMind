import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette } from './theme.ts';

export type StatVariant = 'steel' | 'signal' | 'clay' | 'sand' | 'peach' | 'white' | 'ink';

const BOX: Record<StatVariant, string> = {
  steel: 'bg-steel',
  signal: 'bg-signal',
  clay: 'bg-clay',
  sand: 'bg-sand',
  peach: 'bg-peach',
  white: 'bg-white border border-hairline',
  ink: 'bg-ink',
};
const TEXT: Record<StatVariant, string> = {
  steel: 'text-ink',
  signal: 'text-white',
  clay: 'text-brown',
  sand: 'text-ink',
  peach: 'text-brown',
  white: 'text-ink',
  ink: 'text-paper',
};
const VALUE_SIZE = { lg: 'text-[32px] leading-[38px]', md: 'text-[25px] leading-[30px]', sm: 'text-[23px] leading-[28px]' };

export interface StatCardProps {
  variant: StatVariant;
  overline: string;
  /** a string, or a node (e.g. AmountText) */
  value: ReactNode;
  meta?: string | string[];
  size?: 'lg' | 'md' | 'sm';
  onPress?: () => void;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  /** secondary tappable meta line, e.g. "Remind all in one tap" */
  action?: { label: string; onPress: () => void };
}

export function StatCard({ variant, overline, value, meta, size = 'md', onPress, shadow, style, action }: StatCardProps) {
  const metas = meta === undefined ? [] : Array.isArray(meta) ? meta : [meta];
  const text = TEXT[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={overline}
      className={`justify-between rounded-[28px] p-4 ${BOX[variant]} ${onPress ? 'active:opacity-90' : ''}`}
      style={[
        shadow && {
          shadowColor: palette.ink,
          shadowOpacity: 0.1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 4,
        },
        style,
      ]}
    >
      <Text className={`font-sans-semibold text-[12px] uppercase tracking-[1px] ${text}`}>{overline}</Text>
      <View>
        {typeof value === 'string' ? (
          <Text className={`font-sans-bold ${VALUE_SIZE[size]} ${text}`} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        ) : (
          value
        )}
        {metas.map((m) => (
          <Text key={m} className={`font-sans text-[12px] opacity-80 ${text}`} numberOfLines={2}>
            {m}
          </Text>
        ))}
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={6} accessibilityRole="button">
            <Text className={`font-sans-semibold mt-1 text-[12px] ${text}`}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
