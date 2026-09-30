import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { palette, type IconName } from './theme.ts';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** sand background, monospaced label (alias chips) */
  mono?: boolean;
  neutral?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function Chip({ label, selected = false, onPress, icon, mono, neutral, disabled, testID }: ChipProps) {
  const box = selected
    ? 'bg-ink'
    : mono || neutral
      ? 'bg-sand'
      : 'bg-white border border-hairline';
  const radius = mono ? 'rounded-xl' : 'rounded-pill';
  const textColor = selected ? 'text-paper' : 'text-text';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      className={`min-h-[40px] flex-row items-center justify-center gap-1.5 px-4 py-2 ${box} ${radius} ${
        disabled ? 'opacity-50' : 'active:opacity-80'
      }`}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? palette.paper : palette.ink} /> : null}
      <Text
        className={`${mono ? 'font-mono text-[13px]' : 'font-sans-semibold text-[15px]'} ${textColor}`}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Wrapping row of chips (gap 8). */
export function ChipGroup({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
