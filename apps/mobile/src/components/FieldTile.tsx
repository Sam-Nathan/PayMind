import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';

export interface FieldTileProps {
  label: string;
  /** static value (renders bold); omit when passing `children` (an inline input) */
  value?: string;
  children?: ReactNode;
  variant?: 'light' | 'onInk';
  /** AI-guessed / low-confidence: clay border + rust caption */
  flag?: string;
  onPress?: () => void;
  /** grid cell: take half the row */
  half?: boolean;
}

export function FieldTile({ label, value, children, variant = 'light', flag, onPress, half = true }: FieldTileProps) {
  const onInk = variant === 'onInk';
  const box = onInk
    ? 'bg-ink-soft rounded-2xl p-3'
    : `bg-white rounded-[18px] p-3.5 ${flag ? 'border-[1.5px] border-clay' : 'border border-hairline'}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}: ${value}` : label}
      className={`${box} ${half ? 'w-[48.5%]' : 'w-full'} ${onPress ? 'active:opacity-80' : ''}`}
    >
      <Text className={`font-sans-medium text-[12px] uppercase tracking-[0.8px] ${onInk ? 'text-steel' : 'text-muted'}`}>
        {label}
      </Text>
      {children ?? (
        <Text className={`font-sans-bold mt-1 text-[17px] ${onInk ? 'text-paper' : 'text-ink'}`} numberOfLines={2}>
          {value}
        </Text>
      )}
      {flag ? <Text className="font-sans mt-1 text-[12px] text-rust">{flag}</Text> : null}
    </Pressable>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap justify-between gap-y-3">{children}</View>;
}

/** "Needs your OK" AI proposal (Ask screen); same data contract as the voice field grid. */
export function ProposalCard({
  title,
  fields,
  summary,
  onConfirm,
  onEdit,
  status = 'pending',
}: {
  title: string;
  fields: { label: string; value: string }[];
  summary?: string;
  onConfirm: () => void;
  onEdit: () => void;
  status?: 'pending' | 'accepted' | 'edited' | 'rejected';
}) {
  return (
    <Card tone="ink" radius={28} padding={16}>
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-clay">{title}</Text>
        <Text className="font-sans text-[14px] text-steel">{status === 'accepted' ? 'Confirmed ✓' : 'Needs your OK'}</Text>
      </View>
      <View className="mt-3 flex-row flex-wrap justify-between gap-y-2.5">
        {fields.map((f) => (
          <FieldTile key={f.label} label={f.label} value={f.value} variant="onInk" />
        ))}
      </View>
      {summary ? <Text className="font-sans mt-3 text-[14px] leading-5 text-paper/85">{summary}</Text> : null}
      {status === 'pending' ? (
        <View className="mt-4 flex-row gap-2">
          <Button label="Confirm" variant="paperOnInk" size="lg" full onPress={onConfirm} />
          <Button label="Edit" variant="ghostOnInk" size="lg" onPress={onEdit} />
        </View>
      ) : null}
    </Card>
  );
}
