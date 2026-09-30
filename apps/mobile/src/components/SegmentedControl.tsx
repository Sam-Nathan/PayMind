import { Pressable, Text, View } from 'react-native';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `onHero`: dark track with a paper pill (Family hero) */
  tone?: 'light' | 'onHero';
  /** white pill (default) or ink pill (choice sets) */
  selectedStyle?: 'white' | 'ink';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = 'light',
  selectedStyle = 'white',
}: SegmentedControlProps<T>) {
  const track = tone === 'onHero' ? 'bg-oxblood-deep' : 'bg-sand';
  return (
    <View className={`h-[50px] flex-row rounded-[20px] p-1 ${track}`} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        const pill = selected
          ? tone === 'onHero'
            ? 'bg-paper'
            : selectedStyle === 'ink'
              ? 'bg-ink'
              : 'bg-white'
          : '';
        const text = selected
          ? tone === 'onHero'
            ? 'text-oxblood'
            : selectedStyle === 'ink'
              ? 'text-paper'
              : 'text-text'
          : tone === 'onHero'
            ? 'text-paper/70'
            : 'text-muted';
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`flex-1 items-center justify-center rounded-2xl ${pill}`}
          >
            <Text className={`font-sans-semibold text-[14px] ${text}`} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
