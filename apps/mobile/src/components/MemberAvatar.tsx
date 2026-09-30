import { Text, View } from 'react-native';
import { avatarColor, palette } from './theme.ts';

export interface MemberAvatarProps {
  /** stable id for the colour hash */
  id: string;
  name: string;
  isYou?: boolean;
  size?: 32 | 36 | 44 | 52 | 56;
  /** 2px ring in the surface colour, for overlapping stacks */
  ringColor?: string;
  former?: boolean;
}

export function MemberAvatar({ id, name, isYou = false, size = 36, ringColor, former = false }: MemberAvatarProps) {
  const initial = (former ? 'F' : name.trim().charAt(0) || '?').toUpperCase();
  return (
    <View
      accessibilityLabel={name}
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: former ? palette.stone : avatarColor(id, isYou),
        borderWidth: ringColor ? 2 : 0,
        borderColor: ringColor,
      }}
    >
      <Text className="font-sans-bold text-white" style={{ fontSize: Math.round(size * 0.42) }}>
        {initial}
      </Text>
    </View>
  );
}

/** Overlapping avatars (overlap -8). */
export function AvatarStack({
  members,
  size = 36,
  ringColor,
  max = 5,
}: {
  members: { id: string; name: string; isYou?: boolean }[];
  size?: MemberAvatarProps['size'];
  ringColor?: string;
  max?: number;
}) {
  return (
    <View className="flex-row">
      {members.slice(0, max).map((m, i) => (
        <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <MemberAvatar id={m.id} name={m.name} isYou={m.isYou ?? false} size={size} ringColor={ringColor} />
        </View>
      ))}
    </View>
  );
}
