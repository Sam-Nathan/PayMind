import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Chip,
  ChipGroup,
  DateField,
  ErrorNote,
  FieldGrid,
  FieldTile,
  HeroHeader,
  IconButton,
  Sheet,
  SegmentedControl,
  Skeleton,
  fmtMoney,
  palette,
} from '../components/index.ts';
import {
  aiErrorCopy,
  isAiDisabled,
  markProposal,
  useParseExpense,
  useProposal,
  type ParseExpenseResponse,
} from '../data/ai.ts';
import { addDays, isoDateToDateTime, shortDate, toIsoDate } from '../data/dates.ts';
import { friendlyError } from '../data/errors.ts';
import { computeShares } from '../data/payloads.ts';
import { useCategories, useCreateExpense } from '../data/useExpenses.ts';
import { findMyMember, useSpaceMembers, useSpaces } from '../data/useSpaces.ts';
import { useAuth } from '../providers/AuthProvider.tsx';
import { PAID_VIA_LABEL } from '../features/ai/format.ts';
import { VOICE_LOCALES, useSpeech, type VoiceLocale } from '../features/ai/speech.ts';
import { AiOffNote, HideNativeHeader } from '../features/ai/ui/chrome.tsx';
import { CategorySheet, ValueSheet, categoryLabel } from '../features/ai/ui/sheets.tsx';
import { RecordButton, Waveform } from '../features/ai/ui/voiceParts.tsx';
import {
  blankVoiceDraft,
  buildVoiceSplit,
  explainOwes,
  voiceDraftFromAssistant,
  voiceDraftFromParse,
  type AssistantExpense,
  type VoiceDraft,
} from '../features/ai/voiceDraft.ts';
import type { PaidVia } from '../data/types.ts';

const PAY_OPTIONS: PaidVia[] = ['upi', 'cash', 'card', 'bank', 'wallet', 'other'];
type SheetName = 'amount' | 'merchant' | 'category' | 'date' | 'with' | 'paidBy' | 'split' | 'note' | null;

function dayLabel(date: string): string {
  const now = new Date();
  const prefix = date === toIsoDate(now) ? 'Today, ' : date === toIsoDate(addDays(now, -1)) ? 'Yesterday, ' : '';
  return `${prefix}${shortDate(date)}`;
}

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const params = useLocalSearchParams<{ proposalId?: string }>();
  const editingProposal = useProposal(params.proposalId);
  const spaces = useSpaces();
  const categories = useCategories();
  const parse = useParseExpense();
  const create = useCreateExpense();

  const [locale, setLocale] = useState<VoiceLocale>('en-IN');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [heard, setHeard] = useState('');
  const [emptyHeard, setEmptyHeard] = useState(false);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [parsed, setParsed] = useState<ParseExpenseResponse | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [parseError, setParseError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [saving, setSaving] = useState(false);
  const source = useRef<'voice' | 'text'>('text');

  const submit = async (text: string, from: 'voice' | 'text') => {
    source.current = from;
    setParseError(null);
    setSaveError(null);
    if (!text.trim()) {
      setEmptyHeard(true);
      return;
    }
    setEmptyHeard(false);
    setHeard(text);
    try {
      const res = await parse.mutateAsync({ text: text.trim(), locale, source: from, today: toIsoDate(new Date()) });
      setParsed(res);
      setProposalId(res.proposalId);
      setDraft(voiceDraftFromParse(res.expense, res.resolution));
      setTouched(false);
    } catch (e) {
      setParseError(e);
    }
  };

  const speech = useSpeech(locale, (t) => void submit(t, 'voice'));

  // Edit mode: opened from an Ask proposal.
  const editPayload = editingProposal.data?.payload as { expense?: AssistantExpense } | undefined;
  const editSpaceMembers = useSpaceMembers(editPayload?.expense?.spaceId ?? undefined);
  useEffect(() => {
    const row = editingProposal.data;
    if (!row || draft || !editPayload?.expense) return;
    if (editPayload.expense.spaceId && editSpaceMembers.isPending) return;
    const me = findMyMember(editSpaceMembers.data, uid);
    setDraft(voiceDraftFromAssistant(editPayload.expense, me?.id ?? null));
    setProposalId(row.id);
    setTouched(true);
  }, [editingProposal.data, editSpaceMembers.data, editSpaceMembers.isPending, draft, editPayload, uid]);

  const members = useSpaceMembers(draft?.spaceId ?? undefined);
  const active = useMemo(() => (members.data ?? []).filter((m) => !m.leftAt), [members.data]);
  const me = findMyMember(active, uid);
  const nameOf = (id: string) => (id === me?.id ? 'You' : (active.find((m) => m.id === id)?.displayName ?? 'Someone'));
  const spaceName = spaces.data?.find((s) => s.id === draft?.spaceId)?.name ?? null;
  const cats = categories.data ?? [];

  const patch = (p: Partial<VoiceDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setTouched(true);
  };

  const split = draft && me ? buildVoiceSplit(draft, me.id) : null;
  const preview = useMemo(() => {
    if (!draft || !split || !draft.amountMinor) return { shares: null as Record<string, number> | null, problem: null as string | null };
    try {
      return { shares: computeShares(draft.amountMinor, split), problem: null };
    } catch (e) {
      return { shares: null, problem: friendlyError(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, me?.id]);

  const consequence =
    draft && me && preview.shares
      ? explainOwes({ shares: preview.shares, payerId: draft.paidById ?? me.id, meId: me.id, nameOf, spaceName })
      : null;

  const save = async () => {
    if (!draft) return;
    setSaveError(null);
    if (!draft.amountMinor) return setSaveError('Add the amount first.');
    if (preview.problem) return setSaveError(preview.problem);
    setSaving(true);
    try {
      const shared = !!split && !!me && !!draft.spaceId;
      const categoryId = cats.find((c) => c.slug === draft.categorySlug)?.id ?? null;
      const title = draft.merchant.trim() || (draft.categorySlug ? (cats.find((c) => c.slug === draft.categorySlug)?.name ?? 'Expense') : 'Expense');
      const expenseId = await create.mutateAsync({
        spaceId: shared ? draft.spaceId : null,
        title,
        totalMinor: draft.amountMinor,
        categoryId,
        paidByMember: shared ? (draft.paidById ?? (me as { id: string }).id) : null,
        paidVia: draft.paidVia,
        occurredAt: isoDateToDateTime(draft.date),
        split: shared ? split : null,
        note: draft.note,
        source: source.current,
      });
      if (proposalId) await markProposal(proposalId, touched ? 'edited' : 'accepted', expenseId).catch(() => {});
      router.back();
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const heroTitle = params.proposalId ? 'Edit expense' : 'Say an expense';
  const busy = parse.isPending;
  const withNames = draft ? draft.withIds.map(nameOf) : [];
  const unresolved = draft?.unresolved ?? [];
  const ambiguous = draft?.ambiguous ?? [];
  const withValue = (() => {
    if (!draft) return '';
    const parts = [...withNames, ...unresolved.map((n) => `${n} (not found)`), ...ambiguous.map((a) => `${a.spoken}?`)];
    return parts.length > 0 ? parts.join(', ') : 'Just me';
  })();
  const withFlag =
    ambiguous.length > 0
      ? `Which ${ambiguous[0]?.spoken}? Tap to choose.`
      : unresolved.length > 0
        ? `Couldn't find ${unresolved.join(', ')} in your spaces. This will be saved as yours only.`
        : undefined;
  const splitValue = (() => {
    if (!draft || !split) return 'Not split';
    const n = 'memberIds' in split ? split.memberIds.length : Object.keys('weights' in split ? split.weights : split.amounts).length;
    if (draft.splitMode === 'equal') return n === 2 ? 'Half each' : `Equally · ${n}`;
    return draft.splitMode === 'ratio' ? 'By ratio' : 'Fixed amounts';
  })();

  return (
    <View className="flex-1 bg-paper">
      <HideNativeHeader />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <HeroHeader tone="ink">
          <View className="h-11 flex-row items-center justify-between">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
            <Text className="font-sans-semibold text-[16px] text-paper">{heroTitle}</Text>
            <View className="w-11" />
          </View>

          {params.proposalId ? (
            <Text className="font-sans mt-6 text-center text-[15px] leading-[22px] text-steel">
              Check each field and tap any of them to fix it. Nothing is saved until you press Save.
            </Text>
          ) : typing || !speech.available ? (
            <View className="mt-5 gap-3">
              <Text className="font-sans-medium text-center text-[14px] text-steel">
                {speech.available ? 'Type it the way you\'d say it' : 'Voice needs the PayMind app build. Type it here instead.'}
              </Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                multiline
                placeholder="Spent 300 on auto with Neel yesterday, split it half"
                placeholderTextColor="#8C95A6"
                textAlignVertical="top"
                accessibilityLabel="Describe the expense"
                maxLength={500}
                className="font-sans min-h-[110px] rounded-2xl bg-white/10 p-4 text-[18px] text-paper"
              />
              <SegmentedControl options={VOICE_LOCALES} value={locale} onChange={setLocale} tone="onHero" />
              <Button
                label="Read it"
                variant="paperOnInk"
                size="lg"
                loading={busy}
                disabled={typed.trim().length === 0}
                onPress={() => void submit(typed, 'text')}
              />
              {speech.available ? <Button label="Use my voice" variant="textOnInk" onPress={() => setTyping(false)} /> : null}
            </View>
          ) : (
            <View className="mt-3 items-center gap-4">
              <Waveform active={speech.listening} />
              <Text className="font-sans-medium min-h-[58px] text-center text-[22px] leading-[29px] text-paper" numberOfLines={3}>
                {speech.transcript || heard ? `“${speech.transcript || heard}”` : speech.listening ? 'Listening…' : 'Tap the button and say it'}
              </Text>
              <RecordButton listening={speech.listening} onPress={speech.listening ? speech.stop : () => void speech.start()} />
              <SegmentedControl options={VOICE_LOCALES} value={locale} onChange={setLocale} tone="onHero" />
              <Text className="font-sans text-center text-[13px] text-steel">Hindi, Kannada and English understood · tap to re-record</Text>
            </View>
          )}
        </HeroHeader>

        <View className="gap-4 px-4 pt-5">
          {speech.problem === 'permission' ? (
            <ErrorNote message="PayMind needs the microphone to hear you. You can allow it in Settings, or type instead." />
          ) : null}
          {emptyHeard || speech.problem === 'no-speech' ? <ErrorNote message="Didn't catch that. Tap the mic to try again." /> : null}
          {speech.problem === 'other' ? <ErrorNote message="Speech recognition stopped. Tap the mic to try again, or type instead." /> : null}
          {parseError ? (
            isAiDisabled(parseError) ? (
              <View className="gap-3">
                <AiOffNote message={aiErrorCopy(parseError)} />
                {!draft ? <Button label="Fill it in myself" variant="outline" onPress={() => setDraft(blankVoiceDraft())} /> : null}
              </View>
            ) : (
              <ErrorNote message={aiErrorCopy(parseError)} />
            )
          ) : null}

          {busy ? (
            <View className="gap-3">
              <Text className="font-sans-semibold text-[18px] text-ink">Working it out…</Text>
              <Skeleton height={76} radius={18} />
              <Skeleton height={76} radius={18} />
            </View>
          ) : null}

          {draft && !busy ? (
            <>
              <View className="flex-row items-baseline justify-between">
                <Text className="font-sans-semibold text-[18px] text-ink">Here's what I heard</Text>
                <Text className="font-sans text-[13px] text-muted">Tap to fix</Text>
              </View>
              <FieldGrid>
                <FieldTile label="Amount" value={draft.amountMinor ? fmtMoney(draft.amountMinor, draft.amountMinor % 100 === 0 ? 0 : 2) : 'Add amount'} onPress={() => setSheet('amount')} />
                <FieldTile label="Merchant" value={draft.merchant || 'Add a name'} onPress={() => setSheet('merchant')} />
                <FieldTile
                  label="Category"
                  value={(() => {
                    const c = cats.find((x) => x.slug === draft.categorySlug);
                    return c ? categoryLabel(c, cats) : 'Choose';
                  })()}
                  onPress={() => setSheet('category')}
                />
                <FieldTile label="Date" value={dayLabel(draft.date)} onPress={() => setSheet('date')} />
                <FieldTile label="With" value={withValue} flag={withFlag} onPress={() => setSheet('with')} />
                <FieldTile
                  label="Paid by"
                  value={`${draft.paidById ? nameOf(draft.paidById) : 'You'} · ${(PAID_VIA_LABEL[draft.paidVia] ?? 'UPI').toLowerCase()}`}
                  onPress={() => setSheet('paidBy')}
                />
                <FieldTile label="Split" value={splitValue} onPress={() => setSheet('split')} />
                <FieldTile
                  label="Note"
                  value={draft.note ? `“${draft.note}”` : 'Add a note'}
                  flag={draft.note ? draft.guessed.note : undefined}
                  onPress={() => setSheet('note')}
                />
              </FieldGrid>

              <View className="rounded-[22px] bg-mist p-4">
                <View className="flex-row items-start gap-3">
                  <Ionicons name="information-circle-outline" size={20} color={palette.slate} />
                  <Text className="font-sans flex-1 text-[14px] leading-5 text-slate">
                    {preview.problem
                      ? preview.problem
                      : consequence
                        ? `${consequence} It'll be grouped with their other open items in the next reminder.`
                        : draft.spaceId && split
                          ? `Saved in ${spaceName ?? 'your space'}.`
                          : 'Saved as your own expense. Only you can see it.'}
                  </Text>
                </View>
              </View>
              {saveError ? <ErrorNote message={saveError} /> : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      {draft && !busy ? (
        <View className="absolute inset-x-0 bottom-0 flex-row gap-2 border-t border-hairline bg-paper px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          {params.proposalId ? (
            <Button label="Cancel" variant="outline" size="lg" onPress={() => router.back()} />
          ) : (
            <Button
              label="Type instead"
              variant="outline"
              size="lg"
              onPress={() => {
                setTyping(true);
                setTyped(heard);
              }}
            />
          )}
          <View className="flex-1">
            <Button label="Save expense" size="lg" loading={saving} disabled={!draft.amountMinor} onPress={save} />
          </View>
        </View>
      ) : null}

      {/* Editors */}
      <ValueSheet
        visible={sheet === 'amount'}
        title="Amount"
        label="Rupees"
        kind="rupees"
        initial={draft?.amountMinor ? (draft.amountMinor / 100).toFixed(2) : ''}
        onClose={() => setSheet(null)}
        onSave={(_v, minor) => {
          patch({ amountMinor: minor });
          setSheet(null);
        }}
      />
      <ValueSheet
        visible={sheet === 'merchant'}
        title="Merchant"
        label="Name"
        allowEmpty
        initial={draft?.merchant ?? ''}
        onClose={() => setSheet(null)}
        onSave={(v) => {
          patch({ merchant: v });
          setSheet(null);
        }}
      />
      <ValueSheet
        visible={sheet === 'note'}
        title="Note"
        label="Only you can see this"
        allowEmpty
        initial={draft?.note ?? ''}
        onClose={() => setSheet(null)}
        onSave={(v) => {
          patch({ note: v, guessed: { ...draft?.guessed, note: undefined } });
          setSheet(null);
        }}
      />
      <CategorySheet
        visible={sheet === 'category'}
        categories={cats}
        selectedSlug={draft?.categorySlug ?? null}
        onClose={() => setSheet(null)}
        onPick={(slug) => {
          patch({ categorySlug: slug });
          setSheet(null);
        }}
      />
      <Sheet visible={sheet === 'date'} onClose={() => setSheet(null)} title="Date">
        <View className="gap-3">
          <DateField value={draft?.date ?? ''} onChange={(v) => patch({ date: v })} />
          <Button label="Done" size="lg" onPress={() => setSheet(null)} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'with'} onClose={() => setSheet(null)} title="Who was with you?">
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <View className="gap-4">
            {ambiguous.map((a) => (
              <View key={a.spoken} className="gap-2">
                <Text className="font-sans-semibold text-[14px] text-ink">{`Which ${a.spoken}?`}</Text>
                <ChipGroup>
                  {a.candidates.map((c) => (
                    <Chip
                      key={c.memberId}
                      label={`${c.displayName} · ${c.spaceName}`}
                      onPress={() =>
                        patch({
                          spaceId: c.spaceId,
                          withIds: draft?.spaceId === c.spaceId ? [...(draft?.withIds ?? []), c.memberId] : [c.memberId],
                          paidById: draft?.spaceId === c.spaceId ? (draft?.paidById ?? null) : null,
                          ambiguous: ambiguous.filter((x) => x.spoken !== a.spoken),
                        })
                      }
                    />
                  ))}
                </ChipGroup>
              </View>
            ))}
            <View className="gap-2">
              <Text className="font-sans-semibold text-[14px] text-ink">Space</Text>
              <ChipGroup>
                <Chip label="Just me" selected={!draft?.spaceId} onPress={() => patch({ spaceId: null, withIds: [], paidById: null })} />
                {(spaces.data ?? []).map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={s.id === draft?.spaceId}
                    onPress={() => s.id !== draft?.spaceId && patch({ spaceId: s.id, withIds: [], paidById: null, splitMode: 'equal', ratio: {}, fixed: {} })}
                  />
                ))}
              </ChipGroup>
            </View>
            {draft?.spaceId ? (
              <View className="gap-2">
                <Text className="font-sans-semibold text-[14px] text-ink">People</Text>
                <ChipGroup>
                  {active
                    .filter((m) => m.id !== me?.id)
                    .map((m) => {
                      const on = draft.withIds.includes(m.id);
                      return (
                        <Chip
                          key={m.id}
                          label={m.displayName}
                          selected={on}
                          onPress={() => patch({ withIds: on ? draft.withIds.filter((x) => x !== m.id) : [...draft.withIds, m.id], unresolved: [] })}
                        />
                      );
                    })}
                </ChipGroup>
              </View>
            ) : null}
            <Button label="Done" size="lg" onPress={() => setSheet(null)} />
          </View>
        </ScrollView>
      </Sheet>

      <Sheet visible={sheet === 'paidBy'} onClose={() => setSheet(null)} title="Who paid, and how?">
        <View className="gap-4">
          {draft?.spaceId && active.length > 1 ? (
            <ChipGroup>
              {active
                .filter((m) => m.id === me?.id || draft.withIds.includes(m.id))
                .map((m) => (
                  <Chip
                    key={m.id}
                    label={m.id === me?.id ? 'You' : m.displayName}
                    selected={(draft.paidById ?? me?.id) === m.id}
                    onPress={() => patch({ paidById: m.id === me?.id ? null : m.id })}
                  />
                ))}
            </ChipGroup>
          ) : null}
          <ChipGroup>
            {PAY_OPTIONS.map((p) => (
              <Chip key={p} label={PAID_VIA_LABEL[p] as string} selected={draft?.paidVia === p} onPress={() => patch({ paidVia: p })} />
            ))}
          </ChipGroup>
          <Button label="Done" size="lg" onPress={() => setSheet(null)} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'split'} onClose={() => setSheet(null)} title="How to split?">
        <View className="gap-3">
          {!split ? (
            <Text className="font-sans text-[14px] text-muted">Add someone in "With" to split this expense.</Text>
          ) : (
            <>
              <ChipGroup>
                <Chip label="Equally" selected={draft?.splitMode === 'equal'} onPress={() => patch({ splitMode: 'equal' })} />
                {draft && Object.keys(draft.ratio).length >= 2 ? (
                  <Chip label="As you said (ratio)" selected={draft.splitMode === 'ratio'} onPress={() => patch({ splitMode: 'ratio' })} />
                ) : null}
                {draft && Object.keys(draft.fixed).length >= 1 ? (
                  <Chip label="As you said (amounts)" selected={draft.splitMode === 'fixed'} onPress={() => patch({ splitMode: 'fixed' })} />
                ) : null}
              </ChipGroup>
              <Text className="font-sans text-[12px] text-muted">For custom splits by item, scan the bill instead.</Text>
            </>
          )}
          <Button label="Done" size="lg" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </View>
  );
}
