import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorNote,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  TextField,
  fmtMoney,
} from '../../../components/index.ts';
import { friendlyError } from '../../../data/errors.ts';
import { useSettlePlan } from '../../../data/settle.ts';
import { encodeDraft } from '../../settle/logic.ts';
import { useMyMonthShare, useSaveSplitRule, useSplitRules, type SplitRuleRow } from '../data.ts';
import {
  BILL_METHODS,
  billKindOf,
  billMethodLabel,
  billShares,
  billTotal,
  inMonth,
  monthLong,
  ruleFromRow,
  ruleParams,
  type BillMethod,
  type MemberLike,
} from '../logic.ts';
import { InviteIcon, type SpaceCtx } from './common.tsx';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function RoommatesView({ ctx }: { ctx: SpaceCtx }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = ctx;
  const now = useMemo(() => new Date(), []);
  const me = ctx.myMember as NonNullable<SpaceCtx['myMember']>;
  const members: MemberLike[] = useMemo(
    () => ctx.active.map((m) => ({ id: m.id, displayName: m.displayName, shareWeight: m.shareWeight })),
    [ctx.active],
  );
  const month = useMemo(() => ctx.expenses.filter((e) => inMonth(e.occurredAt, now)), [ctx.expenses, now]);

  const rules = useSplitRules(id);
  const save = useSaveSplitRule(id);
  const myShare = useMyMonthShare(id, me.id, now);
  const { plan } = useSettlePlan(id);
  const owe = plan?.pays[0];
  const owed = plan?.gets[0];

  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (row: SplitRuleRow, method: BillMethod, usage?: Record<string, number>) => {
    setError(null);
    try {
      const existingUsage = (row.params as { usage?: Record<string, number> } | null)?.usage;
      await save.mutateAsync({
        existingId: row.id,
        billKind: row.billKind,
        name: row.name ?? titleCase(row.billKind),
        method,
        params: ruleParams(method, members, usage ?? existingUsage),
      });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={ctx.space.name} onBack={() => router.back()} right={<InviteIcon spaceId={id} />} />

        <View className="mt-4 gap-3">
          <Card tone="steel" radius={28} padding={18}>
            <Text className="font-sans-bold text-[13px] uppercase tracking-[1.3px] text-ink">
              {monthLong(now)} statement · your share
            </Text>
            <View className="mt-2 items-start">
              {myShare.isPending ? <Skeleton height={56} width="55%" /> : <AmountText paise={myShare.data ?? 0} variant="hero" size={60} />}
            </View>
            <View className="mt-3 flex-row items-center gap-3 rounded-[18px] bg-white p-3.5">
              <View className="flex-1">
                {owe ? (
                  <>
                    <Text className="font-sans text-[17px] text-ink">
                      You owe {owe.name.split(' ')[0]} <Text className="font-sans-bold">{fmtMoney(owe.amountMinor)}</Text>
                    </Text>
                    <Text className="font-sans mt-0.5 text-[14px] text-muted" numberOfLines={2}>
                      After netting everything in this space
                    </Text>
                  </>
                ) : owed ? (
                  <Text className="font-sans text-[17px] text-ink">
                    {owed.name.split(' ')[0]} owes you <Text className="font-sans-bold">{fmtMoney(owed.amountMinor)}</Text>
                  </Text>
                ) : (
                  <Text className="font-sans-semibold text-[17px] text-ink">You&apos;re all square.</Text>
                )}
              </View>
              {owe ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/pay/[id]', params: { id: 'draft', items: encodeDraft(owe.items) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay ${owe.name}`}
                  className="h-11 w-[84px] items-center justify-center rounded-2xl bg-signal active:opacity-90"
                >
                  <Text className="font-sans-bold text-[16px] text-white">Pay</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>

          <SectionHeader
            title="Each bill has its own rule"
            meta={members.map((m) => (m.id === me.id ? 'You' : m.displayName.split(' ')[0])).join(' · ')}
          />

          {rules.isPending ? (
            <Skeleton height={90} radius={24} />
          ) : rules.isError ? (
            <ErrorNote message={friendlyError(rules.error)} onRetry={() => rules.refetch()} />
          ) : (rules.data ?? []).length === 0 ? (
            <Card>
              <EmptyState
                title="No bills yet"
                body="Each bill can have its own rule: rent by room, electricity by usage, internet equally."
              />
            </Card>
          ) : (
            (rules.data ?? []).map((row) => (
              <BillCard
                key={row.id}
                row={row}
                members={members}
                total={billTotal(row.billKind, month, ctx.categories)}
                open={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                onMethod={(m) => change(row, m)}
                onUsage={(u) => change(row, 'by_usage', u)}
                busy={save.isPending}
                meId={me.id}
              />
            ))
          )}

          {error ? <ErrorNote message={error} /> : null}

          <Button label="+ Add a household bill" variant="dashed" size="lg" onPress={() => setAddOpen(true)} />
          <Button
            label="+ Add expense"
            variant="outline"
            size="lg"
            onPress={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
          />
        </View>
      </ScrollView>

      <AddBillSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        members={members}
        existing={(rules.data ?? []).map((r) => r.billKind)}
        onSave={async (name, method) => {
          await save.mutateAsync({ billKind: billKindOf(name), name, method, params: ruleParams(method, members) });
          setAddOpen(false);
        }}
      />
    </View>
  );
}

function BillCard({
  row,
  members,
  total,
  open,
  onToggle,
  onMethod,
  onUsage,
  busy,
  meId,
}: {
  row: SplitRuleRow;
  members: MemberLike[];
  total: number;
  open: boolean;
  onToggle: () => void;
  onMethod: (m: BillMethod) => void;
  onUsage: (usage: Record<string, number>) => void;
  busy: boolean;
  meId: string;
}) {
  const rule = ruleFromRow(row.method, row.params, members);
  const shares = billShares(total, rule);
  const name = row.name ?? titleCase(row.billKind);
  const first = (id: string) => (id === meId ? 'You' : (members.find((m) => m.id === id)?.displayName.split(' ')[0] ?? '?'));
  const stored = ((row.params as { usage?: Record<string, number> } | null)?.usage ?? {}) as Record<string, number>;
  const [readings, setReadings] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, stored[m.id] !== undefined ? String(stored[m.id]) : ''])),
  );
  const editable = row.method === 'equal' || row.method === 'by_usage' || row.method === 'by_room';
  const needsReadings = row.method === 'by_usage' && !rule;

  const sub = shares
    ? `${billMethodLabel(row.method)} · ${members.map((m) => fmtMoney(shares[m.id] ?? 0)).join(' · ')}`
    : billMethodLabel(row.method);

  return (
    <Card radius={24} padding={16} emphasis={open ? 'ink2' : 'none'} onPress={editable ? onToggle : undefined} accessibilityLabel={name}>
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-bold flex-1 text-[17px] text-ink">{name}</Text>
        <Text className="font-sans-bold text-[19px] text-ink">{total > 0 ? fmtMoney(total) : '—'}</Text>
      </View>
      <Text className="font-sans mt-0.5 text-[14px] text-muted">{sub}</Text>

      {open && editable ? (
        <View className="mt-3 gap-3">
          <SegmentedControl options={BILL_METHODS} value={row.method as BillMethod} selectedStyle="ink" onChange={onMethod} />
          {shares ? (
            <View className="flex-row gap-2">
              {members.map((m) => (
                <View key={m.id} className="flex-1 rounded-2xl bg-paper p-3">
                  <Text className="font-sans text-[14px] text-muted" numberOfLines={1}>
                    {first(m.id)}
                  </Text>
                  <Text className="font-sans-bold text-[19px] text-ink">{fmtMoney(shares[m.id] ?? 0)}</Text>
                </View>
              ))}
            </View>
          ) : total <= 0 ? (
            <Text className="font-sans text-[14px] text-muted">No {name.toLowerCase()} bill this month yet.</Text>
          ) : null}

          {row.method === 'by_usage' ? (
            <View className="gap-2">
              <Text className="font-sans text-[14px] leading-5 text-muted">
                {needsReadings
                  ? 'Enter each person’s meter reading to split by usage.'
                  : 'From the sub-meter readings you each log on the 1st. Common areas split equally.'}
              </Text>
              {members.map((m) => (
                <TextField
                  key={m.id}
                  label={`${first(m.id)} (units)`}
                  value={readings[m.id] ?? ''}
                  onChangeText={(v) => setReadings((r) => ({ ...r, [m.id]: v }))}
                  keyboardType="decimal-pad"
                />
              ))}
              <Button
                label="Save readings"
                variant="dark"
                size="sm"
                loading={busy}
                onPress={() =>
                  onUsage(
                    Object.fromEntries(
                      members.map((m) => {
                        const n = Number(readings[m.id]);
                        return [m.id, Number.isFinite(n) && n >= 0 ? n : 0];
                      }),
                    ),
                  )
                }
              />
            </View>
          ) : row.method === 'by_room' ? (
            <Text className="font-sans text-[14px] leading-5 text-muted">Split by room size, using each person&apos;s share weight.</Text>
          ) : (
            <Text className="font-sans text-[14px] leading-5 text-muted">Everyone pays the same.</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}

function AddBillSheet({
  visible,
  onClose,
  members,
  existing,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  members: MemberLike[];
  existing: string[];
  onSave: (name: string, method: BillMethod) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<BillMethod>('equal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = billKindOf(name);
  const submit = async () => {
    if (!kind) return setError('Give the bill a name.');
    if (existing.includes(kind)) return setError('That bill already has a rule.');
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), method);
      setName('');
      setMethod('equal');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a household bill">
      <View className="gap-3">
        <TextField label="Bill" value={name} onChangeText={setName} placeholder="e.g. Internet, Cleaning" />
        <View>
          <Text className="font-sans-semibold mb-1.5 text-[13px] text-muted">Split rule</Text>
          <ChipGroup>
            {BILL_METHODS.map((m) => (
              <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />
            ))}
          </ChipGroup>
          <Text className="font-sans mt-2 text-[13px] text-muted">
            {members.length} people share this bill. You can log readings for usage after adding it.
          </Text>
        </View>
        {error ? <ErrorNote message={error} /> : null}
        <Button label="Add bill" size="lg" loading={busy} onPress={submit} />
      </View>
    </Sheet>
  );
}
