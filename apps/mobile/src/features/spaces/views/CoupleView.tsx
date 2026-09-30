import { paiseToRupeeString } from '@paymind/core';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  ListCard,
  ListRow,
  ProgressBar,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  StatusBox,
  TextField,
  fmtMoney,
  palette,
} from '../../../components/index.ts';
import { friendlyError } from '../../../data/errors.ts';
import { parseAmountInput } from '../../../data/payloads.ts';
import { useDefaultSplit, useSetDefaultSplit, useSpaceGoal } from '../data.ts';
import {
  SHARE_PRESETS,
  coupleSplit,
  coupleStatus,
  defaultSplitToPreset,
  inMonth,
  monthLong,
  presetToDefaultSplit,
  splitHelper,
  type SharePreset,
} from '../logic.ts';
import { InviteIcon, type SpaceCtx } from './common.tsx';

export function CoupleView({ ctx }: { ctx: SpaceCtx }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { space, id } = ctx;
  const now = useMemo(() => new Date(), []);
  const me = ctx.myMember as NonNullable<SpaceCtx['myMember']>;
  const partner = ctx.active.find((m) => m.id !== me.id);
  const partnerName = partner?.displayName ?? 'Partner';

  const month = useMemo(() => ctx.expenses.filter((e) => inMonth(e.occurredAt, now)), [ctx.expenses, now]);
  const total = month.reduce((a, e) => a + e.totalMinor, 0);
  const myPaid = month.filter((e) => e.paidByMember === me.id).reduce((a, e) => a + e.totalMinor, 0);
  const partnerPaid = month.filter((e) => partner && e.paidByMember === partner.id).reduce((a, e) => a + e.totalMinor, 0);
  const budget = space.budgetMinor;

  const stored = useDefaultSplit(id);
  const setSplit = useSetDefaultSplit(id);
  const parsed = useMemo(
    () => defaultSplitToPreset(stored.data, me.id, partner?.id),
    [stored.data, me.id, partner?.id],
  );
  const [preset, setPreset] = useState<SharePreset>(parsed.preset);
  const [fixedText, setFixedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPreset(parsed.preset);
    setFixedText(parsed.fixedPartnerMinor ? paiseToRupeeString(parsed.fixedPartnerMinor).replace(/\.00$/, '') : '');
  }, [parsed.preset, parsed.fixedPartnerMinor]);

  const fixedMinor = parseAmountInput(fixedText) ?? 0;
  // The stored rule may have been written by the partner (their 60 is my 40; their fixed amount is mine).
  const flipped = preset === parsed.preset && parsed.flipped;
  const split = partner ? coupleSplit(total, preset, me.id, partner.id, fixedMinor, flipped) : null;
  const status = coupleStatus(myPaid, split?.myShareMinor ?? 0, partnerName);

  const save = async (next: SharePreset, fixed = fixedMinor) => {
    if (!partner) return;
    setError(null);
    const before = preset;
    setPreset(next);
    try {
      // Keep who covers the fixed amount when re-saving it from the other side.
      const keepSide = next === 'fixed' && flipped;
      await setSplit.mutateAsync(
        keepSide ? presetToDefaultSplit(next, partner.id, me.id, fixed) : presetToDefaultSplit(next, me.id, partner.id, fixed),
      );
    } catch (e) {
      setPreset(before);
      setError(friendlyError(e));
    }
  };

  const goal = useSpaceGoal(id);
  const g = goal.data;
  const mySaved = g?.byMember.filter((c) => c.memberId === me.id).reduce((a, c) => a + c.amountMinor, 0) ?? 0;
  const partnerSaved = g ? g.savedMinor - mySaved : 0;

  const who = (paidBy: string | null): string => {
    if (paidBy === me.id) return 'you paid';
    return paidBy ? ctx.nameOf(paidBy) : 'both';
  };

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={space.name} onBack={() => router.back()} right={<InviteIcon spaceId={id} />} />

        <View className="mt-4 gap-3">
          <Card tone="clay" radius={28} padding={18}>
            <View className="flex-row items-start justify-between">
              <Text className="font-sans-bold text-[13px] uppercase tracking-[1.3px] text-brown">
                Shared in {monthLong(now)}
              </Text>
              {budget ? (
                <Text className="font-sans text-right text-[14px] text-brown">
                  {Math.round((total / budget) * 100)}% of {fmtMoney(budget)}
                </Text>
              ) : null}
            </View>
            <View className="mt-2 items-start">
              <AmountText paise={total} variant="hero" size={64} />
            </View>
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1 rounded-[18px] bg-[#F4C9A6] p-3.5">
                <Text className="font-sans text-[13px] text-brown">You paid</Text>
                <AmountText paise={myPaid} variant="lg" />
              </View>
              <View className="flex-1 rounded-[18px] bg-[#F4C9A6] p-3.5">
                <Text className="font-sans text-[13px] text-brown" numberOfLines={1}>
                  {partnerName} paid
                </Text>
                <AmountText paise={partnerPaid} variant="lg" />
              </View>
            </View>
          </Card>

          {partner && split ? (
            <Card radius={28} padding={16}>
              <Text className="font-sans-bold mb-3 text-[18px] text-ink">How you share</Text>
              <SegmentedControl
                options={SHARE_PRESETS}
                value={preset}
                selectedStyle="ink"
                onChange={(p) => save(p)}
              />
              {preset === 'fixed' ? (
                <View className="mt-3 flex-row items-end gap-2">
                  <View className="flex-1">
                    <TextField
                      label={flipped ? 'You pay, per month' : `${partnerName} pays, per month`}
                      prefix="₹"
                      value={fixedText}
                      onChangeText={setFixedText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Button label="Save" variant="dark" onPress={() => save('fixed', fixedMinor)} loading={setSplit.isPending} />
                </View>
              ) : null}
              {!split.perItem ? (
                <>
                  <View className="mt-4 h-3 flex-row gap-0.5 overflow-hidden rounded-pill">
                    <View style={{ flex: Math.max(split.myPercent, 1), backgroundColor: palette.signal }} />
                    <View style={{ flex: Math.max(100 - split.myPercent, 1), backgroundColor: palette.steel }} />
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="font-sans text-[14px] text-muted">You · {fmtMoney(split.myShareMinor)}</Text>
                    <Text className="font-sans text-[14px] text-muted">
                      {partnerName} · {fmtMoney(split.partnerShareMinor)}
                    </Text>
                  </View>
                  <View className="mt-3">
                    <StatusBox>{status.text}</StatusBox>
                  </View>
                </>
              ) : null}
              <Text className="font-sans mt-3 text-[14px] leading-5 text-muted">{splitHelper(preset, partnerName)}</Text>
              {error ? (
                <View className="mt-3">
                  <ErrorNote message={error} />
                </View>
              ) : null}
            </Card>
          ) : (
            <Card>
              <EmptyState title="Invite your partner" body="Add them to this space to split things between you." />
            </Card>
          )}

          <SectionHeader title="This month together" />
          {month.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing shared this month yet"
                actionLabel="+ Add expense"
                onAction={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
              />
            </Card>
          ) : (
            <ListCard>
              {month.slice(0, 8).map((e) => (
                <ListRow
                  key={e.id}
                  title={e.title}
                  subtitle={who(e.paidByMember)}
                  right={<AmountText paise={e.totalMinor} variant="row" />}
                />
              ))}
            </ListCard>
          )}

          {g ? (
            <Pressable onPress={() => router.push('/goals')} accessibilityRole="button">
              <Card tone="ink" radius={28} padding={18}>
                <View className="flex-row justify-between">
                  <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-steel">Shared goal</Text>
                  {g.targetDate ? (
                    <Text className="font-sans text-[13px] text-steel">
                      by {new Date(g.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </Text>
                  ) : null}
                </View>
                <Text className="font-sans-bold mt-2 text-[22px] text-paper">
                  {g.name} · {fmtMoney(g.targetMinor)}
                </Text>
                <View className="mt-3">
                  <ProgressBar
                    trackTone="inkSoft"
                    segments={[
                      { value: mySaved / g.targetMinor, color: palette.coral },
                      { value: partnerSaved / g.targetMinor, color: palette.steel },
                    ]}
                  />
                </View>
                <View className="mt-2 flex-row justify-between">
                  <Text className="font-sans text-[14px] text-paper/80">
                    You {fmtMoney(mySaved)} · {partnerName} {fmtMoney(partnerSaved)}
                  </Text>
                  <Text className="font-sans text-[14px] text-paper/80">{fmtMoney(Math.max(0, g.targetMinor - g.savedMinor))} to go</Text>
                </View>
              </Card>
            </Pressable>
          ) : (
            <Button label="+ Add a shared goal" variant="dashed" size="lg" onPress={() => router.push('/goals')} />
          )}

          <View className="flex-row gap-2">
            <Button label="Settle up" size="lg" full onPress={() => router.push({ pathname: '/settle', params: { spaceId: id } })} />
            <Button
              label="+ Add expense"
              variant="outline"
              size="lg"
              full
              onPress={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
