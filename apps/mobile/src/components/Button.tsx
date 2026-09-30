import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette, type IconName } from './theme.ts';

export type ButtonVariant =
  | 'primary'
  | 'dark'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'dashed'
  | 'paperOnInk'
  | 'ghostOnInk'
  | 'textOnInk'
  | 'destructiveOutline';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface Look {
  box: string;
  text: string;
  color: string;
}

const LOOK: Record<ButtonVariant, Look> = {
  primary: { box: 'bg-signal', text: 'text-white', color: palette.white },
  dark: { box: 'bg-ink', text: 'text-paper', color: palette.paper },
  outline: { box: 'bg-white border border-hairline', text: 'text-text', color: palette.ink },
  secondary: { box: 'bg-sand', text: 'text-text', color: palette.ink },
  ghost: { box: 'bg-transparent', text: 'text-ink', color: palette.ink },
  dashed: { box: 'border border-dashed border-stone', text: 'text-ink', color: palette.ink },
  paperOnInk: { box: 'bg-[#F1EEE7]', text: 'text-ink', color: palette.ink },
  ghostOnInk: { box: 'border border-paper/25', text: 'text-paper', color: palette.paper },
  textOnInk: { box: 'bg-transparent', text: 'text-paper', color: palette.paper },
  destructiveOutline: { box: 'bg-white border-[1.5px] border-signal', text: 'text-signal', color: palette.signal },
};

const SIZE: Record<ButtonSize, { box: string; text: string; icon: number }> = {
  lg: { box: 'h-14 rounded-[18px] px-5', text: 'text-[17px]', icon: 20 },
  md: { box: 'h-[50px] rounded-2xl px-4', text: 'text-base', icon: 18 },
  sm: { box: 'h-11 rounded-[14px] px-3.5', text: 'text-sm', icon: 16 },
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  /** stretch to the row width (flex-1 inside a row) */
  full?: boolean;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  full = false,
  loading = false,
  disabled = false,
  testID,
  style,
}: ButtonProps) {
  const look = LOOK[variant];
  const sz = SIZE[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      className={`flex-row items-center justify-center ${look.box} ${sz.box} ${full ? 'flex-1' : ''} ${
        disabled ? 'opacity-50' : 'active:scale-[0.97] active:opacity-90'
      }`}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color={look.color} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {icon ? <Ionicons name={icon} size={sz.icon} color={look.color} /> : null}
          <Text className={`font-sans-semibold text-center ${look.text} ${sz.text}`} numberOfLines={2}>
            {label}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={sz.icon} color={look.color} /> : null}
        </View>
      )}
    </Pressable>
  );
}
