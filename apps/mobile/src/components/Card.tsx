import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { DotTexture } from './DotTexture.tsx';

export type CardTone = 'white' | 'ink' | 'oxblood' | 'steel' | 'clay' | 'sand' | 'peach' | 'mist' | 'signal';

const BG: Record<CardTone, string> = {
  white: 'bg-white border border-hairline',
  ink: 'bg-ink',
  oxblood: 'bg-oxblood',
  steel: 'bg-steel',
  clay: 'bg-clay',
  sand: 'bg-sand',
  peach: 'bg-peach',
  mist: 'bg-mist',
  signal: 'bg-signal',
};

const RADIUS = { 20: 'rounded-[20px]', 24: 'rounded-[24px]', 28: 'rounded-[28px]' } as const;
const PADDING = { 0: 'p-0', 14: 'p-[14px]', 16: 'p-4', 18: 'p-[18px]' } as const;

export interface CardProps {
  tone?: CardTone;
  radius?: keyof typeof RADIUS;
  padding?: keyof typeof PADDING;
  /** 2px ink border = selected/expanded; clay = anomaly */
  emphasis?: 'none' | 'ink2' | 'clay2';
  dashed?: boolean;
  texture?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  children?: ReactNode;
}

export function Card({
  tone = 'white',
  radius = 24,
  padding = 16,
  emphasis = 'none',
  dashed = false,
  texture = false,
  onPress,
  accessibilityLabel,
  style,
  className = '',
  children,
}: CardProps) {
  const border =
    emphasis === 'ink2' ? 'border-2 border-ink' : emphasis === 'clay2' ? 'border-2 border-clay' : '';
  const dash = dashed ? 'border border-dashed border-stone' : '';
  const cls = `overflow-hidden ${dashed ? '' : BG[tone]} ${RADIUS[radius]} ${PADDING[padding]} ${border} ${dash} ${className}`;
  const content = (
    <>
      {texture ? <DotTexture /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={`${cls} active:opacity-90`}
        style={style}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View className={cls} style={style}>
      {content}
    </View>
  );
}
