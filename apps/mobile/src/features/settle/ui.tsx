import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/index.ts';

/** Full-screen flow page: hides the stack header and draws the design's own header row. */
export function FlowScreen({
  title,
  onBack,
  right,
  children,
  refreshing,
  onRefresh,
  background = 'bg-paper',
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  background?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className={`flex-1 ${background}`}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        <ScreenHeader title={title} onBack={onBack} right={right} />
        <View className="mt-4 gap-3">{children}</View>
      </ScrollView>
    </View>
  );
}
