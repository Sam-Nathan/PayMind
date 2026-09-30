import { Text, View } from 'react-native';

export type SettlementStatus =
  | 'initiated'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'confirmed_manual'
  | 'corrected'
  | 'cancelled';

const LOOK: Record<SettlementStatus, { label: string; box: string; text: string }> = {
  initiated: { label: 'PENDING', box: 'bg-peach', text: 'text-rust' },
  pending: { label: 'PENDING', box: 'bg-peach', text: 'text-rust' },
  completed: { label: 'COMPLETED', box: 'bg-mist', text: 'text-slate' },
  confirmed_manual: { label: 'COMPLETED', box: 'bg-mist', text: 'text-slate' },
  failed: { label: 'FAILED', box: 'bg-blush', text: 'text-signal' },
  corrected: { label: 'CORRECTED', box: 'bg-[#F3EFE6]', text: 'text-[#4A453B]' },
  cancelled: { label: 'CANCELLED', box: 'bg-[#F3EFE6]', text: 'text-muted' },
};

/** Settlement status chip; `label` overrides the default text (e.g. "NOT CONFIRMED YET"). */
export function StatusPill({ status, label }: { status: SettlementStatus; label?: string }) {
  const look = LOW(status);
  return (
    <View className={`rounded-[10px] px-2.5 py-1 ${look.box}`}>
      <Text className={`font-sans-bold text-[11px] tracking-[1px] ${look.text}`}>{label ?? look.label}</Text>
    </View>
  );
}

function LOW(status: SettlementStatus) {
  return LOOK[status];
}
