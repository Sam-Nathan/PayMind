/**
 * Small layout helpers for the capture / privacy screens. Colours, Card and Button come from the
 * shared component library (src/components); only screen-specific pieces live here.
 */
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Button as BaseButton, type ButtonVariant } from '../../../components/Button.tsx';
import { palette } from '../../../components/theme.ts';

export { palette };
export { Card } from '../../../components/Card.tsx';

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

type ButtonTone = 'primary' | 'outline' | 'danger' | 'signal' | 'quiet';

const VARIANT: Record<ButtonTone, ButtonVariant> = {
  primary: 'dark',
  outline: 'outline',
  danger: 'destructiveOutline',
  signal: 'primary',
  quiet: 'ghost',
};

/** The shared Button with this module's older `tone` / `flex` prop names. */
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
  return (
    <BaseButton
      label={label}
      onPress={onPress}
      variant={VARIANT[tone]}
      size={size === 'lg' ? 'lg' : 'sm'}
      disabled={disabled || loading}
      loading={loading}
      full={flex}
      testID={testID}
    />
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
