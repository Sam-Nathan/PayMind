import { Text, View } from 'react-native';

/** Temporary screen body. Feature builders replace usages with real UI. */
export function PlaceholderScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-paper px-4">
      <Text className="font-sans-semibold text-2xl text-ink">{title}</Text>
      {detail ? <Text className="mt-2 font-sans text-sm text-text-muted">{detail}</Text> : null}
    </View>
  );
}
