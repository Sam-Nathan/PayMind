import { formatINR } from '@paymind/core';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import { palette } from './theme.ts';

export type AmountVariant = 'hero' | 'xl' | 'lg' | 'row' | 'inline';
export type AmountTone = 'default' | 'positive' | 'negative' | 'onDark' | 'muted';

export interface AmountTextProps {
  /** integer paise */
  paise: number;
  variant?: AmountVariant;
  decimals?: 0 | 2;
  tone?: AmountTone;
  /** prefix + for positive amounts */
  sign?: boolean;
  strike?: boolean;
  /** hero only: digit font size (default 80) */
  size?: number;
  /** optional trailing unit on the baseline, e.g. "a day" */
  unit?: string;
  style?: StyleProp<TextStyle>;
}

const TONE_COLOR: Record<AmountTone, string> = {
  default: palette.ink,
  positive: palette.slate,
  negative: palette.signal,
  onDark: palette.paper,
  muted: palette.muted,
};

const VARIANT_CLASS: Record<Exclude<AmountVariant, 'hero'>, string> = {
  xl: 'font-sans-bold text-[32px] leading-[38px]',
  lg: 'font-sans-bold text-[22px] leading-[28px]',
  row: 'font-sans-bold text-[17px] leading-[22px]',
  inline: 'font-sans-semibold',
};

/** Indian-grouped rupee text with a true minus sign. */
export function fmtMoney(paise: number, decimals: 0 | 2 = 0, sign = false): string {
  return formatINR(paise, { decimals, signed: sign }).replace('-', '−');
}

/**
 * Money. `hero` uses Doto with a small ₹ at the top-left (design: Home "₹1,166"); every other
 * variant is Onest with tabular numerals. Amounts are always paise.
 */
export function AmountText({
  paise,
  variant = 'row',
  decimals = 0,
  tone = 'default',
  sign = false,
  strike = false,
  size = 80,
  unit,
  style,
}: AmountTextProps) {
  const color = TONE_COLOR[tone];
  const decoration = strike ? ('line-through' as const) : ('none' as const);

  if (variant === 'hero') {
    const neg = paise < 0;
    const body = formatINR(Math.abs(paise), { decimals, symbol: false });
    return (
      <View className="flex-row items-start justify-center">
        <Text
          className="font-sans-semibold"
          style={{ color, fontSize: Math.round(size * 0.33), lineHeight: Math.round(size * 0.45), marginRight: 2 }}
        >
          {neg ? '−₹' : sign && paise > 0 ? '+₹' : '₹'}
        </Text>
        <Text
          className="font-display"
          style={[{ color, fontSize: size, lineHeight: Math.round(size * 1.05), textDecorationLine: decoration }, style]}
        >
          {body}
        </Text>
        {unit ? (
          <Text className="font-sans-medium self-end pb-2 pl-2 text-[15px]" style={{ color }}>
            {unit}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Text
      className={VARIANT_CLASS[variant]}
      style={[{ color, textDecorationLine: decoration, fontVariant: ['tabular-nums'] }, style]}
    >
      {fmtMoney(paise, decimals, sign)}
      {unit ? <Text className="font-sans text-[14px]">{` ${unit}`}</Text> : null}
    </Text>
  );
}
