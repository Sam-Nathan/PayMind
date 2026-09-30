import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  Chip,
  ChipGroup,
  ErrorNote,
  IconButton,
  Sheet,
  Skeleton,
  fmtMoney,
} from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { aiErrorCopy, useBillDraft, useLastSplit, useSaveBillExpense } from '../../data/ai.ts';
import { useCategories } from '../../data/useExpenses.ts';
import { findMyMember, useSpaceMembers } from '../../data/useSpaces.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';
import { buildBillExpensePayload } from '../../features/ai/billPayload.ts';
import {
  addItem,
  applyFlagAction,
  computeTotals,
  flagSpec,
  initials,
  isEdited,
  openFlags,
  removeItem,
  setTip,
  updateItem,
  type DraftItem,
} from '../../features/ai/draft.ts';
import { PAID_VIA_LABEL, billDateLabel, namesLabel } from '../../features/ai/format.ts';
import { DetectiveCard } from '../../features/ai/ui/DetectiveCard.tsx';
import { HideNativeHeader, StepPills } from '../../features/ai/ui/chrome.tsx';
import { CategorySheet, ItemEditorSheet, ValueSheet, categoryLabel } from '../../features/ai/ui/sheets.tsx';
import type { PaidVia } from '../../data/types.ts';

const PAY_OPTIONS: PaidVia[] = ['upi', 'cash', 'card', 'bank', 'wallet', 'other'];
const MISMATCH_TYPES = ['price_mismatch', 'tax_mismatch', 'total_mismatch', 'subtotal_mismatch'];

function Row({ label, sub, value, tone, onPress }: { label: string; sub?: string; value: string; tone?: 'slate'; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-baseline justify-between py-1.5">
      <View className="flex-1 pr-3">
        <Text className="font-sans text-[15px] text-ink/80">{label}</Text>
        {sub ? <Text className="font-sans text-[12px] text-muted">{sub}</Text> : null}
      </View>
      <Text className={`font-sans-semibold text-[16px] ${tone === 'slate' ? 'text-slate' : 'text-ink'}`}>{value}</Text>
    </Pressable>
  );
}

export default function UnderstandScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { entry, draft, update, isPending, isError, error, refetch } = useBillDraft(id);
  const categories = useCategories();
  const lastSplit = useLastSplit();
  const hintMembers = useSpaceMembers(lastSplit.data?.spaceId);
  const save = useSaveBillExpense();

  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState<DraftItem | 'new' | null>(null);
  const [sheet, setSheet] = useState<'category' | 'pay' | 'merchant' | 'tip' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totals = useMemo(() => (draft ? computeTotals(draft) : null), [draft]);
  const open = useMemo(() => (draft ? openFlags(draft) : []), [draft]);
  const cats = categories.data ?? [];

  const hintNames = useMemo(() => {
    const ids = new Set(lastSplit.data?.memberIds ?? []);
    const me = findMyMember(hintMembers.data, session?.user.id);
    return (hintMembers.data ?? []).filter((m) => ids.has(m.id) && m.id !== me?.id && !m.leftAt).map((m) => m.displayName);
  }, [lastSplit.data, hintMembers.data, session?.user.id]);

  if (isPending) {
    return (
      <View className="flex-1 bg-paper px-4" style={{ paddingTop: insets.top + 12 }}>
        <HideNativeHeader />
        <Text className="font-sans-semibold mb-4 text-center text-[16px] text-muted">Reading your bill…</Text>
        <View className="gap-3">
          <Skeleton height={110} radius={24} />
          <Skeleton height={190} radius={28} />
          <Skeleton height={300} radius={24} />
        </View>
      </View>
    );
  }

  if (isError || !entry || !draft || !totals) {
    return (
      <View className="flex-1 bg-paper px-4" style={{ paddingTop: insets.top + 12 }}>
        <HideNativeHeader />
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View className="mt-4">
          <ErrorNote message={friendlyError(error)} onRetry={() => refetch()} />
        </View>
      </View>
    );
  }

  if (!entry.parsed && !manual) {
    return (
      <View className="flex-1 bg-paper px-4" style={{ paddingTop: insets.top + 12 }}>
        <HideNativeHeader />
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Card tone="white" radius={28} padding={18}>
          <View className="gap-3">
            <Text className="font-sans-bold text-[20px] text-ink">Couldn't read this bill</Text>
            <Text className="font-sans text-[14px] leading-5 text-muted">
              The photo may be blurry or cut off. Try again, or type the items in yourself.
            </Text>
            <View className="flex-row gap-2">
              <Button label="Try again" full onPress={() => router.replace('/add-bill')} />
              <Button label="Enter manually" variant="outline" full onPress={() => setManual(true)} />
            </View>
          </View>
        </Card>
      </View>
    );
  }

  const merchantInitials = initials(draft.merchant || '?');
  const categoryName = cats.find((c) => c.slug === draft.categorySlug);
  const flagSpecs = open.map((f) => flagSpec(draft, f));
  const flaggedItemIds = new Set(open.map((f) => f.itemId).filter(Boolean));
  const checksOut = !draft.flags.some((f) => MISMATCH_TYPES.includes(f.type));
  const resolvedCount = draft.flags.length - open.length;
  const canSplit = open.length === 0 && draft.items.length > 0;
  const subParts = [categoryName ? categoryLabel(categoryName, cats) : null, draft.location, billDateLabel(draft.occurredAt)].filter(Boolean);

  const goSplit = () => router.push({ pathname: '/split/[id]', params: { id: id as string } });

  const justMe = async () => {
    setSaveError(null);
    try {
      const payload = buildBillExpensePayload({
        draft,
        categoryId: cats.find((c) => c.slug === draft.categorySlug)?.id ?? null,
        edited: isEdited(draft),
      });
      await save.mutateAsync(payload);
      router.replace('/');
    } catch (e) {
      setSaveError(friendlyError(e));
    }
  };

  return (
    <View className="flex-1 bg-paper">
      <HideNativeHeader />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 140, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
          <StepPills steps={['Understand', 'Split · Settle']} active={0} onSelect={canSplit ? goSplit : undefined} />
          <View className="w-11" />
        </View>

        {/* Merchant */}
        <Card tone="white" radius={24} padding={16}>
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-oxblood">
              <Text className="font-sans-bold text-[16px] text-paper">{merchantInitials}</Text>
            </View>
            <Pressable className="flex-1" onPress={() => setSheet('merchant')} accessibilityRole="button" accessibilityLabel="Edit merchant name">
              <Text className="font-sans-semibold text-[18px] text-ink" numberOfLines={1}>
                {draft.merchant || 'Add a merchant'}
              </Text>
              <Text className="font-sans mt-0.5 text-[13px] text-muted" numberOfLines={2}>
                {subParts.join(' · ')}
              </Text>
            </Pressable>
          </View>
          <View className="mt-3">
            <ChipGroup>
              <Chip label={categoryName ? categoryLabel(categoryName, cats) : 'Choose a category'} onPress={() => setSheet('category')} />
              <Chip label={`Paid by you · ${PAID_VIA_LABEL[draft.paidVia] ?? 'UPI'}`} onPress={() => setSheet('pay')} />
            </ChipGroup>
          </View>
          {hintNames.length > 0 ? (
            <Text className="font-sans mt-3 text-[12px] leading-4 text-slate">
              Last time you split with {namesLabel(hintNames)}, so that's what we'll suggest.
            </Text>
          ) : null}
        </Card>

        {/* Bill Detective */}
        <DetectiveCard
          open={flagSpecs}
          resolvedCount={resolvedCount}
          checksOut={checksOut}
          onAction={(flagId, action) => update((d) => applyFlagAction(d, flagId, action))}
        />

        {/* Items */}
        <Card tone="white" radius={24} padding={0}>
          <View className="flex-row items-baseline justify-between px-4 pb-2 pt-4">
            <Text className="font-sans-semibold text-[17px] text-ink">Items</Text>
            <Text className="font-sans text-[12px] text-muted">Tap any value to edit</Text>
          </View>
          {draft.items.length === 0 ? (
            <Text className="font-sans px-4 pb-2 text-[14px] text-muted">No items yet. Add what was on the bill.</Text>
          ) : null}
          {draft.items.map((item) => {
            const flagged = flaggedItemIds.has(item.id);
            return (
              <Pressable
                key={item.id}
                onPress={() => setEditing(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.qty} times ${item.name}, ${fmtMoney(item.amountMinor, 2)}. Edit`}
                className={`min-h-[49px] flex-row items-center border-t border-[#F2F0EA] px-4 py-2 ${flagged ? 'bg-blush' : ''}`}
              >
                <Text className="font-sans w-10 text-[14px] text-muted">{item.qty}×</Text>
                <Text className="font-sans flex-1 pr-2 text-[15px] text-ink" numberOfLines={2}>
                  {item.name}
                  {flagged ? ' (repeat?)' : ''}
                </Text>
                <Text className="font-sans-semibold text-[16px] text-ink">{fmtMoney(item.amountMinor, 2)}</Text>
              </Pressable>
            );
          })}
          <View className="p-4 pt-3">
            <Button label="+ Add a missed item" variant="dashed" onPress={() => setEditing('new')} />
          </View>
        </Card>

        {/* Totals */}
        <Card tone="white" radius={24} padding={16}>
          <Row label="Subtotal" value={fmtMoney(totals.subtotalMinor, 2)} />
          {draft.discounts
            .filter((c) => c.amountMinor !== 0)
            .map((c) => (
              <Row key={c.id} label={/discount/i.test(c.label) ? c.label : `Discount · ${c.label.toLowerCase()}`} value={`−${fmtMoney(Math.abs(c.amountMinor), 2)}`} tone="slate" />
            ))}
          {draft.service ? (
            <Row label={`${draft.service.label}${draft.service.ratePct ? ` ${draft.service.ratePct}%` : ''}`} value={fmtMoney(draft.service.amountMinor, 2)} />
          ) : null}
          {draft.tax.map((c) => (
            <Row key={c.id} label={`${c.label}${c.ratePct ? ` ${c.ratePct}%` : ''}`} value={fmtMoney(c.amountMinor, 2)} />
          ))}
          <Row
            label="Tip"
            sub="(not on bill, added by you)"
            value={fmtMoney(draft.tipMinor, 2)}
            onPress={() => setSheet('tip')}
          />
          <View className="my-2 h-px bg-hairline" />
          <View className="flex-row items-center justify-between">
            <Text className="font-sans-semibold text-[17px] text-ink">Total you paid</Text>
            <AmountText paise={totals.totalMinor} variant="lg" decimals={2} />
          </View>
          <Text className="font-sans mt-3 text-[13px] leading-5 text-muted">
            {draft.source === 'manual'
              ? 'Entered by hand, so there is no printed bill to compare with.'
              : totals.matchesPrinted
                ? `Matches the printed bill.${open.length > 0 ? ' Resolve the flags to finalise.' : ''}`
                : `Differs from the printed bill (${fmtMoney(draft.printedTotalMinor, 2)}) by ${fmtMoney(Math.abs(totals.diffMinor), 2)}. That's expected if you removed or fixed something.${open.length > 0 ? ' Resolve the flags to finalise.' : ''}`}
          </Text>
        </Card>
        {saveError ? <ErrorNote message={saveError} /> : null}
      </ScrollView>

      {/* Action bar */}
      <View
        className="absolute inset-x-0 bottom-0 flex-row gap-2 border-t border-hairline bg-paper px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className="flex-1">
          <Button label="Just me" variant="outline" size="lg" loading={save.isPending} disabled={draft.items.length === 0} onPress={justMe} />
        </View>
        <View style={{ flex: 1.6 }}>
          <Button
            label={`Split with ${namesLabel(hintNames)}`}
            variant="primary"
            size="lg"
            disabled={!canSplit}
            onPress={goSplit}
          />
        </View>
      </View>

      <ItemEditorSheet
        visible={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={(v) => {
          if (editing && editing !== 'new') update((d) => updateItem(d, editing.id, v));
          else update((d) => addItem(d, v));
          setEditing(null);
        }}
        onDelete={
          editing && editing !== 'new'
            ? () => {
                update((d) => removeItem(d, editing.id));
                setEditing(null);
              }
            : undefined
        }
      />
      <CategorySheet
        visible={sheet === 'category'}
        categories={cats}
        selectedSlug={draft.categorySlug}
        onClose={() => setSheet(null)}
        onPick={(slug) => {
          update((d) => ({ ...d, categorySlug: slug }));
          setSheet(null);
        }}
      />
      <Sheet visible={sheet === 'pay'} onClose={() => setSheet(null)} title="How did you pay?">
        <ChipGroup>
          {PAY_OPTIONS.map((p) => (
            <Chip
              key={p}
              label={PAID_VIA_LABEL[p] as string}
              selected={draft.paidVia === p}
              onPress={() => {
                update((d) => ({ ...d, paidVia: p }));
                setSheet(null);
              }}
            />
          ))}
        </ChipGroup>
      </Sheet>
      <ValueSheet
        visible={sheet === 'merchant'}
        title="Merchant"
        label="Name"
        initial={draft.merchant}
        onClose={() => setSheet(null)}
        onSave={(v) => {
          update((d) => ({ ...d, merchant: v }));
          setSheet(null);
        }}
      />
      <ValueSheet
        visible={sheet === 'tip'}
        title="Tip"
        label="Tip you added, in rupees"
        helper="Tips aren't printed on the bill. Leave it empty if you didn't tip."
        kind="rupees"
        allowEmpty
        initial={draft.tipMinor > 0 ? (draft.tipMinor / 100).toFixed(2) : ''}
        onClose={() => setSheet(null)}
        onSave={(_v, minor) => {
          update((d) => setTip(d, minor ?? 0));
          setSheet(null);
        }}
      />
    </View>
  );
}
