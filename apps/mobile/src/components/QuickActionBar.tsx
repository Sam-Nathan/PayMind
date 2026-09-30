import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { palette, type IconName } from './theme.ts';

export interface QuickAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** icon colour: oxblood (default) or signal */
  accent?: 'oxblood' | 'signal';
}

export function QuickActionBar({ actions }: { actions: QuickAction[] }) {
  return (
    <View className="flex-row gap-2 rounded-[28px] bg-sand p-[14px]">
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          className="h-[76px] flex-1 items-center justify-center gap-1.5 rounded-[18px] bg-white active:opacity-80"
        >
          <Ionicons name={a.icon} size={22} color={palette[a.accent ?? 'oxblood']} />
          <Text className="font-sans-semibold text-[13px] text-ink" numberOfLines={1}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
