import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  Chip,
  ChipGroup,
  DateField,
  ErrorNote,
  FieldGrid,
  FieldTile,
  MemberAvatar,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  StatusBox,
  TextField,
  palette,
} from '../components/index.ts';
import { isoDateToDateTime, toIsoDate } from '../data/dates.ts';
import { friendlyError } from '../data/errors.ts';
import {
  computeShares,
  isIsoDate,
  parseAmountInput,
  SPLIT_METHOD_LABELS,
  type SplitInput,
} from '../data/payloads.ts';
import type { PaidVia, SplitMethod } from '../data/types.ts';
import { useCategories, useCreateExpense } from '../data/useExpenses.ts';
import { findMyMember, useSpaceMembers, useSpaces } from '../data/useSpaces.ts';
import { useAuth } from '../providers/AuthProvider.tsx';

type Picker = 'category' | 'space' | 'paidBy' | null;

const PAID_VIA: { value: PaidVia; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];
const METHODS = (['equal', 'ratio', 'fixed', 'shares'] as SplitMethod[]).map((m) => ({
  value: m,
  label: SPLIT_METHOD_LABELS[m],
}));

export default function ExpenseNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const params = useLocalSearchParams<{ spaceId?: string }>();

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(params.spaceId ?? null);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [paidVia, setPaidVia] = useState<PaidVia>('upi');
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [participants, setParticipants] = useState<Set<string> | null>(null); // null = everyone
  const [values, setValues] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Picker>(null);
  const [error, setError] = useState<string | null>(null);

  const spaces = useSpaces();
  const categories = useCategories();
  const membersQ = useSpaceMembers(spaceId ?? undefined);
  const create = useCreateExpense();

  const members = useMemo(() => (spaceId ? (membersQ.data ?? []).filter((m) => !m.leftAt) : []), [spaceId, membersQ.data]);
  const me = findMyMember(members, uid);

  // Default the payer to me once members load (and whenever the space changes).
  useEffect(() => {
    setPaidBy(me?.id ?? null);
    setParticipants(null);
    setValues({});
  }, [spaceId, me?.id]);

  const totalMinor = parseAmountInput(amount);
  const activeIds = participants ?? new Set(members.map((m) => m.id));

  const split: SplitInput | null = useMemo(() => {
    if (!spaceId) return null;
    const ids = members.map((m) => m.id);
    switch (method) {
      case 'equal':
        return { method: 'equal', memberIds: ids.filter((i) => activeIds.has(i)) };
      case 'ratio':
      case 'shares': {
        const weights: Record<string, number> = {};
        for (const id of ids) weights[id] = Number(values[id] ?? '') || 0;
        return { method, weights };
      }
      case 'fixed': {
        const amounts: Record<string, number> = {};
        for (const id of ids) amounts[id] = parseAmountInput(values[id] ?? '') ?? 0;
        return { method: 'fixed', amounts };
      }
    }
  }, [spaceId, members, method, values, participants]);

  const preview = useMemo(() => {
    if (!split || totalMinor === null) return { shares: null as Record<string, number> | null, problem: null as string | null };
    try {
      return { shares: computeShares(totalMinor, split), problem: null };
    } catch (e) {
      return { shares: null, problem: friendlyError(e) };
    }
  }, [split, totalMinor]);

  const categoryName = categories.data?.find((c) => c.id === categoryId)?.name ?? 'Choose';
  const spaceName = spaceId ? (spaces.data?.find((s) => s.id === spaceId)?.name ?? 'Space') : 'Personal';
  const paidByName = members.find((m) => m.id === paidBy)?.displayName;
  const topCategories = (categories.data ?? []).filter((c) => !c.parentId);

  const save = async () => {
    setError(null);
    if (totalMinor === null) return setError('Enter an amount greater than zero.');
    if (!isIsoDate(date)) return setError('Date should look like 2026-10-14.');
    try {
      await create.mutateAsync({
        spaceId,
        title,
        totalMinor,
        categoryId,
        paidByMember: spaceId ? paidBy : null,
        paidVia,
        occurredAt: isoDateToDateTime(date),
        split,
        note,
        source: 'manual',
      });
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const toggleParticipant = (id: string) => {
    const next = new Set(activeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setParticipants(next);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}
      >
        <ScreenHeader title="Add expense" onBack={() => router.back()} />
        <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-clay">Create expense</Text>

        <FieldGrid>
          <FieldTile label="Amount">
            <View className="mt-1 flex-row items-center">
              <Text className="font-sans-bold text-[17px] text-muted">₹</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={palette.stone}
                accessibilityLabel="Amount"
                className="font-sans-bold flex-1 p-0 pl-1 text-[17px] text-ink"
              />
            </View>
          </FieldTile>
          <FieldTile label="Merchant">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Tandoor House"
              placeholderTextColor={palette.stone}
              accessibilityLabel="Merchant or description"
              className="font-sans-bold mt-1 p-0 text-[17px] text-ink"
            />
          </FieldTile>
          <FieldTile label="Category" value={categoryName} onPress={() => setPicker('category')} />
          <FieldTile label="Space" value={spaceName} onPress={() => setPicker('space')} />
          {spaceId ? (
            <FieldTile label="Paid by" value={paidBy === me?.id ? 'You' : (paidByName ?? 'Choose')} onPress={() => setPicker('paidBy')} />
          ) : null}
        </FieldGrid>

        <DateField label="Date" value={date} onChange={setDate} />

        <View className="gap-2">
          <Text className="font-sans-semibold text-[13px] text-muted">How was it paid?</Text>
          <ChipGroup>
            {PAID_VIA.map((p) => (
              <Chip key={p.value} label={p.label} selected={paidVia === p.value} onPress={() => setPaidVia(p.value)} />
            ))}
          </ChipGroup>
        </View>

        <TextField label="Private note (only you see this)" value={note} onChangeText={setNote} placeholder="Optional" />

        {spaceId ? (
          <View className="gap-3">
            <Text className="font-sans-bold text-[18px] text-ink">Split</Text>
            <SegmentedControl options={METHODS} value={method} onChange={setMethod} />
            {membersQ.isPending ? (
              <Text className="font-sans text-[14px] text-muted">Loading people…</Text>
            ) : (
              <Card padding={14} radius={24}>
                <View className="gap-3">
                  {members.map((m) => {
                    const isYou = m.id === me?.id;
                    const owed = preview.shares?.[m.id];
                    return (
                      <View key={m.id} className="flex-row items-center gap-3">
                        <MemberAvatar id={m.id} name={m.displayName} isYou={isYou} size={36} />
                        <Text className="font-sans-semibold flex-1 text-[16px] text-ink" numberOfLines={1}>
                          {isYou ? 'You' : m.displayName}
                        </Text>
                        {method === 'equal' ? (
                          <Chip
                            label={activeIds.has(m.id) ? 'In' : 'Out'}
                            selected={activeIds.has(m.id)}
                            onPress={() => toggleParticipant(m.id)}
                          />
                        ) : (
                          <View className="h-10 w-24 flex-row items-center rounded-xl border border-hairline bg-paper px-2.5">
                            {method === 'fixed' ? <Text className="font-sans text-[14px] text-muted">₹</Text> : null}
                            <TextInput
                              value={values[m.id] ?? ''}
                              onChangeText={(v) => setValues((cur) => ({ ...cur, [m.id]: v }))}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={palette.stone}
                              accessibilityLabel={`${m.displayName} ${SPLIT_METHOD_LABELS[method]}`}
                              className="font-sans-semibold flex-1 p-0 pl-1 text-[15px] text-ink"
                            />
                            {method === 'ratio' ? <Text className="font-sans text-[14px] text-muted">%</Text> : null}
                          </View>
                        )}
                        <View className="w-24 items-end">
                          {owed !== undefined ? <AmountText paise={owed} variant="row" decimals={2} /> : <Text className="text-muted">—</Text>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}
            {preview.problem && totalMinor !== null ? <StatusBox tone="peach">{preview.problem}</StatusBox> : null}
          </View>
        ) : (
          <StatusBox>Personal expenses are only visible to you and aren't split.</StatusBox>
        )}

        {error ? <ErrorNote message={error} /> : null}
        <Button label="Save expense" size="lg" loading={create.isPending} onPress={save} />
      </ScrollView>

      <Sheet visible={picker === 'category'} onClose={() => setPicker(null)} title="Category">
        <ScrollView>
          <ChipGroup>
            {topCategories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={c.id === categoryId}
                onPress={() => {
                  setCategoryId(c.id === categoryId ? null : c.id);
                  setPicker(null);
                }}
              />
            ))}
          </ChipGroup>
        </ScrollView>
      </Sheet>
      <Sheet visible={picker === 'space'} onClose={() => setPicker(null)} title="Space">
        <ChipGroup>
          <Chip
            label="Personal"
            selected={spaceId === null}
            onPress={() => {
              setSpaceId(null);
              setPicker(null);
            }}
          />
          {(spaces.data ?? [])
            .filter((s) => s.status === 'active' || s.status === 'settling')
            .map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={spaceId === s.id}
                onPress={() => {
                  setSpaceId(s.id);
                  setPicker(null);
                }}
              />
            ))}
        </ChipGroup>
      </Sheet>
      <Sheet visible={picker === 'paidBy'} onClose={() => setPicker(null)} title="Paid by">
        <ChipGroup>
          {members.map((m) => (
            <Chip
              key={m.id}
              label={m.id === me?.id ? 'You' : m.displayName}
              selected={paidBy === m.id}
              onPress={() => {
                setPaidBy(m.id);
                setPicker(null);
              }}
            />
          ))}
        </ChipGroup>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
