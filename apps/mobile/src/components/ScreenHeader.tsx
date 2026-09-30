import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { palette, type IconName } from './theme.ts';

export type IconButtonTone = 'light' | 'dark' | 'primary' | 'paper';

const BOX: Record<IconButtonTone, string> = {
  light: 'bg-sand',
  dark: 'bg-white/10',
  primary: 'bg-ink',
  paper: 'bg-[#F3ECE2]',
};
const ICON: Record<IconButtonTone, string> = {
  light: palette.ink,
  dark: palette.paper,
  primary: palette.paper,
  paper: palette.ink,
};

export function IconButton({
  icon,
  onPress,
  tone = 'light',
  badgeDot = false,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  tone?: IconButtonTone;
  badgeDot?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-11 w-11 items-center justify-center rounded-[14px] active:opacity-80 ${BOX[tone]}`}
    >
      <Ionicons name={icon} size={21} color={ICON[tone]} />
      {badgeDot ? <View className="absolute right-2.5 top-2.5 h-2 w-2 rounded-pill bg-clay" /> : null}
    </Pressable>
  );
}

/** Back button + centred title + optional right slot. Put inside a SafeArea-padded container. */
export function ScreenHeader({
  title,
  onBack,
  right,
  tone = 'light',
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <View className="h-11 flex-row items-center justify-between">
      <View className="w-24 items-start">
        {onBack ? <IconButton icon="chevron-back" onPress={onBack} tone={tone} label="Back" /> : null}
      </View>
      <Text
        className={`font-sans-semibold flex-1 text-center text-[18px] ${tone === 'dark' ? 'text-paper' : 'text-ink'}`}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View className="w-24 items-end">{right}</View>
    </View>
  );
}
