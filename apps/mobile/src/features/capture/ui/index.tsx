/**
 * Minimal local UI primitives for the capture / privacy / upi screens.
 * They follow docs/design/components.md and will be swapped for the shared component library
 * (src/components) when the branches merge.
 */
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

export const palette = {
  oxblood: '#6E1F1B',
  signal: '#B3261E',
  ink: '#232833',
  steel: '#BCCCD6',
  clay: '#E3A06F',
  paper: '#F7F5F0',
  white: '#FFFFFF',
  muted: '#6A6459',
  sand: '#EDE7DB',
  peach: '#F6E3D5',
  mist: '#EDF3F6',
  blush: '#FAEBE7',
  slate: '#2F4A5D',
  rust: '#994516',
  stone: '#CBC2B3',
  hairline: '#E9E4DA',
} as const;

/** Scrolling page body: paper background, 16 px gutters. */
export function Screen({ children, bottomPad = 32 }: { children: ReactNode; bottomPad?: number }) {
  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomPad }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

type CardTone = 'white' | 'ink' | 'mist' | 'peach' | 'sand';
const cardTone: Record<CardTone, string> = {
  white: 'bg-white border border-[#E9E4DA]',
  ink: 'bg-ink',
  mist: 'bg-[#EDF3F6]',
  peach: 'bg-[#F6E3D5]',
  sand: 'bg-[#EDE7DB]',
};

export function Card({
  tone = 'white',
  children,
  style,
}: {
  tone?: CardTone;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View className={`rounded-[24px] p-4 ${cardTone[tone]}`} style={style}>
      {children}
    </View>
  );
}

type ButtonTone = 'primary' | 'outline' | 'danger' | 'signal' | 'quiet';

const buttonBox: Record<ButtonTone, string> = {
  primary: 'bg-ink',
  outline: 'bg-white border border-[#E9E4DA]',
  danger: 'bg-white border-[1.5px] border-signal',
  signal: 'bg-signal',
  quiet: 'bg-transparent',
};
const buttonText: Record<ButtonTone, string> = {
  primary: 'text-paper',
  outline: 'text-ink',
  danger: 'text-signal',
  signal: 'text-white',
  quiet: 'text-text-muted',
};

export function Button({
  label,
  onPress,
  tone = 'primary',
  size = 'md',
  disabled,
  loading,
  flex,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  flex?: boolean;
  testID?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      testID={testID}
      disabled={off}
      onPress={onPress}
      className={`items-center justify-center ${size === 'lg' ? 'h-14 rounded-[18px]' : 'h-11 rounded-[16px]'} ${buttonBox[tone]} ${
        off ? 'opacity-50' : 'active:opacity-80'
      }`}
      style={flex ? { flex: 1 } : undefined}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'primary' || tone === 'signal' ? palette.paper : palette.ink} />
      ) : (
        <Text className={`${size === 'lg' ? 'text-[17px]' : 'text-[15px]'} font-sans-semibold ${buttonText[tone]}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Overline({ children }: { children: ReactNode }) {
  return (
    <Text
      className="mb-2 mt-6 px-1 font-sans-bold text-[12px] uppercase text-text-muted"
      style={{ letterSpacing: 1.3 }}
    >
      {children}
    </Text>
  );
}

export function Pill({ label, tone = 'sand' }: { label: string; tone?: 'sand' | 'peach' | 'mist' }) {
  const bg = tone === 'peach' ? 'bg-[#F6E3D5]' : tone === 'mist' ? 'bg-[#EDF3F6]' : 'bg-[#EDE7DB]';
  return (
    <View className={`self-start rounded-pill px-3 py-1 ${bg}`}>
      <Text className="font-sans-semibold text-[12px] text-ink">{label}</Text>
    </View>
  );
}

/** Switch with the design's colours: ink track when on, stone when off. */
export function Toggle({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ false: palette.stone, true: palette.ink }}
      thumbColor={palette.white}
      ios_backgroundColor={palette.stone}
    />
  );
}

/** A settings row: title + description on the left, control on the right. */
export function SettingRow({
  title,
  description,
  right,
  onPressTitle,
  last,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  onPressTitle?: () => void;
  last?: boolean;
}) {
  const titleEl = <Text className="font-sans-semibold text-[17px] text-ink">{title}</Text>;
  return (
    <View
      className="flex-row items-center px-4 py-4"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: '#F2F0EA' }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        {onPressTitle ? (
          <Pressable accessibilityRole="button" onPress={onPressTitle}>
            {titleEl}
          </Pressable>
        ) : (
          titleEl
        )}
        {description ? <Text className="mt-1 font-sans text-[14px] text-text-muted">{description}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** White grouped card that holds SettingRows. */
export function Group({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-[24px] border border-[#E9E4DA] bg-white">{children}</View>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text className="px-2 py-6 text-center font-sans text-[14px] text-text-muted">{children}</Text>;
}
