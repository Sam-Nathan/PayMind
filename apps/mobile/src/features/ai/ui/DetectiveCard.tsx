import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { Button, Card, Overline, palette } from '../../../components/index.ts';
import type { FlagAction, FlagCardSpec } from '../draft.ts';

/** Bill Detective: ink card with one FlagCard per open flag (tone: explain, never accuse). */
export function DetectiveCard({
  open,
  resolvedCount,
  checksOut,
  onAction,
}: {
  open: FlagCardSpec[];
  resolvedCount: number;
  /** no price, GST, subtotal or total flag was raised */
  checksOut: boolean;
  onAction: (flagId: string, action: FlagAction) => void;
}) {
  if (open.length === 0) {
    return (
      <Card tone="ink" radius={28} padding={16}>
        <View className="flex-row items-center gap-2">
          <Ionicons name="checkmark-circle-outline" size={18} color={palette.clay} />
          <Text className="font-sans text-[13px] text-paper/75">
            {resolvedCount > 0
              ? 'All flags looked at. Nothing else to review.'
              : 'Nothing odd found.'}
          </Text>
        </View>
      </Card>
    );
  }
  return (
    <Card tone="ink" radius={28} padding={16}>
      <Overline tone="clay" icon="search-outline">{`Bill detective · ${open.length} to review`}</Overline>
      <View className="mt-3 gap-3">
        {open.map((f) => (
          <View key={f.flagId} className="rounded-[20px] bg-ink-soft p-4">
            <Text className="font-sans-semibold text-[15px] text-paper">{f.title}</Text>
            <Text className="font-sans mt-1.5 text-[13px] leading-5 text-paper/85">{f.body}</Text>
            <View className="mt-3 flex-row items-center justify-between gap-2">
              <Button label={f.primaryLabel} variant="textOnInk" size="sm" onPress={() => onAction(f.flagId, 'primary')} />
              <Button label={f.secondaryLabel} variant="ghostOnInk" size="sm" onPress={() => onAction(f.flagId, 'secondary')} />
            </View>
          </View>
        ))}
      </View>
      {checksOut ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Ionicons name="checkmark-circle-outline" size={16} color={palette.steel} />
          <Text className="font-sans flex-1 text-[13px] text-paper/75">
            Quantities × prices, GST rate and discount all check out.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
