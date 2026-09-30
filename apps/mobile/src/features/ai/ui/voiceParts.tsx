import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { palette } from '../../../components/index.ts';

const BARS = [18, 30, 22, 44, 28, 52, 36, 20, 48, 32, 56, 24, 40, 16, 34, 50, 26, 42, 18, 54, 30, 22, 46, 28, 38, 20, 32, 14];

/** ~28 rounded bars; they breathe while `active` (listening). */
export function Waveform({ active }: { active: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      phase.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(phase, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, phase]);
  return (
    <View className="h-16 flex-row items-center justify-center gap-[5px]" accessibilityElementsHidden>
      {BARS.map((h, i) => {
        const to = i % 2 === 0 ? 0.45 : 1.35;
        const scaleY = phase.interpolate({ inputRange: [0, 1], outputRange: [1, to] });
        return (
          <Animated.View
            key={i}
            style={{ width: 4, height: h, borderRadius: 2, backgroundColor: active ? palette.steel : '#545B6E', transform: [{ scaleY }] }}
          />
        );
      })}
    </View>
  );
}

/** 120px record control: pulsing ring + signal disc + mic. */
export function RecordButton({ listening, onPress }: { listening: boolean; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop recording' : 'Start recording'}
      className="h-[120px] w-[120px] items-center justify-center"
    >
      <Animated.View
        style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: palette.signal, opacity: listening ? opacity : 0.25, transform: [{ scale: listening ? scale : 1 }] }}
      />
      <View className="h-24 w-24 items-center justify-center rounded-full bg-signal">
        <Ionicons name={listening ? 'stop' : 'mic'} size={32} color={palette.white} />
      </View>
    </Pressable>
  );
}
