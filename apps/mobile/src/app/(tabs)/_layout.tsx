import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@paymind/ui-tokens';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View, type ColorValue, type PressableProps } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName, focusedName: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color} />
  );

/** Raised, signal-red centre button for the Scan tab. */
function ScanTabButton({ onPress, accessibilityLabel }: PressableProps) {
  return (
    <View className="flex-1 items-center">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Scan a bill'}
        className="-mt-6 h-16 w-16 items-center justify-center rounded-pill bg-signal active:opacity-90"
        style={{
          shadowColor: colors.ink,
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="scan" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.oxblood,
        tabBarInactiveTintColor: colors.gray['500'],
        tabBarLabelStyle: { fontFamily: 'Onest_500Medium', fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.gray['200'] },
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }}
      />
      <Tabs.Screen
        name="spaces"
        options={{ title: 'Spaces', tabBarIcon: icon('people-outline', 'people') }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarLabel: () => null,
          tabBarButton: (props) => <ScanTabButton {...(props as PressableProps)} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          tabBarIcon: icon('chatbubble-ellipses-outline', 'chatbubble-ellipses'),
        }}
      />
      <Tabs.Screen
        name="money"
        options={{ title: 'Money', tabBarIcon: icon('wallet-outline', 'wallet') }}
      />
    </Tabs>
  );
}
