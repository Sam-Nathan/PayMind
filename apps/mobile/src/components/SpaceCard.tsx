import Ionicons from '@expo/vector-icons/Ionicons';
import type { SpaceType } from '@paymind/core';
import { Pressable, Text, View } from 'react-native';
import { AmountText, fmtMoney } from './AmountText.tsx';
import { Card } from './Card.tsx';
import { AvatarStack } from './MemberAvatar.tsx';
import { SPACE_TYPES } from './spaceTypes.ts';
import { Overline } from './Text.tsx';
import { palette } from './theme.ts';

export type SpaceBalanceStatus = 'owe' | 'owed' | 'square';

/** Small Home card (horizontal scroller): dark for an active trip, white otherwise. */
export function SpaceCard({
  title,
  status,
  amountMinor,
  caption,
  dark = false,
  onPress,
}: {
  title: string;
  status: SpaceBalanceStatus;
  amountMinor: number;
  /** ink variant: "1 of 4 settled"; white variant: e.g. "60 / 40" */
  caption?: string;
  dark?: boolean;
  onPress?: () => void;
}) {
  const label = status === 'owe' ? 'You owe' : status === 'owed' ? "You're owed" : 'All square';
  const tone = status === 'owe' ? 'text-signal' : status === 'owed' ? 'text-slate' : 'text-slate';
  return (
    <Card
      tone={dark ? 'ink' : 'white'}
      padding={16}
      onPress={onPress}
      accessibilityLabel={title}
      className="h-[185px] w-[160px] justify-between"
    >
      <Text className={`font-sans-semibold text-[15px] ${dark ? 'text-white' : 'text-ink'}`} numberOfLines={2}>
        {title}
      </Text>
      <View>
        {dark ? (
          <>
            <Text className="font-sans-bold text-[16px] text-paper">{amountMinor ? `${fmtMoney(amountMinor)} total` : 'No spend yet'}</Text>
            {caption ? <Text className="font-sans mt-0.5 text-[12px] text-paper/70">{caption}</Text> : null}
          </>
        ) : (
          <>
            <Text className={`font-sans-semibold text-[12px] ${tone}`}>{label}</Text>
            {status !== 'square' ? (
              <AmountText paise={Math.abs(amountMinor)} variant="inline" tone={status === 'owe' ? 'negative' : 'positive'} />
            ) : caption ? (
              <Text className="font-sans-bold text-[13px] text-slate">{caption}</Text>
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

export function SpaceIconTile({ type, name }: { type: SpaceType; name: string }) {
  const info = SPACE_TYPES[type];
  return (
    <View className="h-[52px] w-[52px] items-center justify-center rounded-2xl" style={{ backgroundColor: info.tint }}>
      {info.icon ? (
        <Ionicons name={info.icon} size={24} color={info.iconColor} />
      ) : (
        <Text className="font-sans-bold text-[20px]" style={{ color: info.iconColor }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
}

/** Full-width list row for the Spaces tab. */
export function SpaceRow({
  type,
  name,
  subtitle,
  status,
  amountMinor,
  upcoming,
  onPress,
}: {
  type: SpaceType;
  name: string;
  subtitle: string;
  status: SpaceBalanceStatus;
  amountMinor: number;
  upcoming?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      className={`min-h-[76px] flex-row items-center gap-3 rounded-[22px] p-3.5 active:opacity-90 ${
        upcoming ? 'border border-dashed border-stone' : 'border border-hairline bg-white'
      }`}
    >
      <SpaceIconTile type={type} name={name} />
      <View className="flex-1">
        <Text className="font-sans-bold text-[18px] text-ink" numberOfLines={1}>
          {name}
        </Text>
        <Text className="font-sans mt-0.5 text-[13px] text-muted" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {upcoming ? (
        <Text className="font-sans-semibold text-[13px] text-muted">Upcoming</Text>
      ) : status === 'square' ? (
        <Text className="font-sans-bold text-[14px] text-slate">All square</Text>
      ) : (
        <View className="items-end">
          <Text className={`font-sans-semibold text-[12px] ${status === 'owe' ? 'text-signal' : 'text-slate'}`}>
            {status === 'owe' ? 'You owe' : 'Owed'}
          </Text>
          <AmountText paise={Math.abs(amountMinor)} variant="row" tone={status === 'owe' ? 'negative' : 'positive'} />
        </View>
      )}
    </Pressable>
  );
}

/** Ink featured card for the most relevant settling space. */
export function FeaturedSpaceCard({
  overline,
  title,
  pill,
  members,
  totalMinor,
  note,
  onPress,
}: {
  overline: string;
  title: string;
  pill?: string;
  members: { id: string; name: string; isYou?: boolean }[];
  totalMinor: number;
  note?: string;
  onPress: () => void;
}) {
  return (
    <Card tone="ink" radius={28} padding={18} texture onPress={onPress} accessibilityLabel={title}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Overline tone="steel">{overline}</Overline>
          <Text className="font-sans-bold mt-1 text-[26px] text-paper" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {pill ? (
          <View className="rounded-pill bg-clay px-3 py-1.5">
            <Text className="font-sans-bold text-[13px] text-ink">{pill}</Text>
          </View>
        ) : null}
      </View>
      <View className="mt-5 flex-row items-end justify-between">
        <AvatarStack members={members} ringColor={palette.ink} />
        <View className="items-end">
          <AmountText paise={totalMinor} variant="lg" tone="onDark" />
          {note ? <Text className="font-sans text-[13px] text-steel">{note}</Text> : null}
        </View>
      </View>
    </Card>
  );
}
