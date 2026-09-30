import { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button.tsx';
import { palette } from './theme.ts';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center px-6 py-8">
      <Text className="font-sans-semibold text-center text-[17px] text-ink">{title}</Text>
      {body ? <Text className="font-sans mt-1.5 text-center text-[14px] leading-5 text-muted">{body}</Text> : null}
      {actionLabel && onAction ? (
        <View className="mt-4">
          <Button label={actionLabel} onPress={onAction} size="sm" variant="dark" />
        </View>
      ) : null}
    </View>
  );
}

/** Sand block that pulses; size it to match the card it stands in for. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 12,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: radius, backgroundColor: palette.sand, opacity }, style]}
    />
  );
}

/** Inline error block with optional retry. */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="rounded-[18px] bg-blush p-4">
      <Text className="font-sans-semibold text-[14px] text-signal">{message}</Text>
      {onRetry ? (
        <View className="mt-3 self-start">
          <Button label="Try again" size="sm" variant="outline" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** Mist info box. */
export function StatusBox({ children, tone = 'mist' }: { children: string; tone?: 'mist' | 'sand' | 'peach' }) {
  const bg = tone === 'mist' ? 'bg-mist' : tone === 'sand' ? 'bg-sand' : 'bg-peach';
  return (
    <View className={`rounded-[18px] p-4 ${bg}`}>
      <Text className="font-sans-semibold text-[14px] leading-5 text-slate">{children}</Text>
    </View>
  );
}
