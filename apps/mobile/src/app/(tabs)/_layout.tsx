import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, View, type ColorValue, type PressableProps } from 'react-native';
import { palette, type IconName } from '../../components/theme.ts';

const icon =
  (name: IconName, focusedName: IconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={24} color={color} />
  );

/** Raised signal-red centre button. It pushes /add-bill instead of switching tab. */
function ScanTabButton({ accessibilityLabel }: PressableProps) {
  const router = useRouter();
  return (
    <View className="flex-1 items-center">
      <Pressable
        onPress={() => router.push('/add-bill')}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Scan a bill'}
        className="-mt-[26px] h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-signal active:opacity-90"
        style={{
          shadowColor: palette.signal,
          shadowOpacity: 0.35,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        }}
      >
        <Ionicons name="scan" size={26} color={palette.white} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.signal,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: { fontFamily: 'Onest_600SemiBold', fontSize: 11 },
        tabBarStyle: { backgroundColor: '#FAF7F6', borderTopColor: palette.hairline, borderTopWidth: 1 },
        sceneStyle: { backgroundColor: palette.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="spaces" options={{ title: 'Spaces', tabBarIcon: icon('people-outline', 'people') }} />
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
        options={{ title: 'Ask', tabBarIcon: icon('sparkles-outline', 'sparkles') }}
      />
      <Tabs.Screen
        name="money"
        options={{ title: 'Money', tabBarIcon: icon('bar-chart-outline', 'bar-chart') }}
      />
    </Tabs>
  );
}
