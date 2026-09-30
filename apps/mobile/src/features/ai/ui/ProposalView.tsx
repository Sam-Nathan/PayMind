import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, ProposalCard } from '../../../components/index.ts';
import {
  aiErrorCopy,
  markProposal,
  sendReminder,
  voidExpense,
  type AssistantProposal,
} from '../../../data/ai.ts';
import { friendlyError } from '../../../data/errors.ts';
import { useCategories, useCreateExpense } from '../../../data/useExpenses.ts';
import { findMyMember, useSpaceMembers, useSpaces } from '../../../data/useSpaces.ts';
import { useAuth } from '../../../providers/AuthProvider.tsx';
import {
  describeExpenseProposal,
  describeReminderProposal,
  type ReminderPayload,
} from '../proposal.ts';
import type { AssistantExpense } from '../voiceDraft.ts';

type Status = 'pending' | 'accepted' | 'edited' | 'rejected';

/** One assistant proposal as a "Needs your OK" card. Nothing changes until Confirm. */
export function ProposalView({ proposal }: { proposal: AssistantProposal }) {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const spaces = useSpaces();
  const categories = useCategories();
  const create = useCreateExpense();
  const payload = (proposal.payload ?? {}) as { expense?: AssistantExpense } & Partial<ReminderPayload>;
  const spaceId = proposal.kind === 'create_expense' ? (payload.expense?.spaceId ?? null) : (payload.spaceId ?? null);
  const members = useSpaceMembers(spaceId ?? undefined);
  const spaceName = spaces.data?.find((s) => s.id === spaceId)?.name ?? null;

  const [status, setStatus] = useState<Status>('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  if (proposal.kind === 'create_expense' && payload.expense) {
    const me = findMyMember(members.data, uid);
    const view = describeExpenseProposal(payload.expense, {
      members: members.data ?? [],
      meId: me?.id ?? null,
      spaceName,
      categories: categories.data ?? [],
    });

    const confirm = async () => {
      if (!view.draft) return setError(view.problem ?? 'This proposal can\'t be saved as it is. Tap Edit to fix it.');
      setBusy(true);
      setError(null);
      try {
        const id = await create.mutateAsync(view.draft);
        setExpenseId(id);
        await markProposal(proposal.id, 'accepted', id).catch(() => {});
        setStatus('accepted');
        setDoneText(view.doneText);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(false);
      }
    };

    const undo = async () => {
      if (!expenseId) return;
      setBusy(true);
      try {
        await voidExpense(expenseId);
        setUndone(true);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(false);
      }
    };

    return (
      <View className="gap-2">
        {status === 'accepted' ? (
          <View className="flex-row items-center justify-between self-start rounded-[22px] rounded-bl-[6px] border border-hairline bg-white px-4 py-3">
            <Text className="font-sans-semibold text-[15px] text-ink">{undone ? 'Undone — nothing was added' : doneText}</Text>
            {!undone ? (
              <Pressable onPress={undo} disabled={busy} hitSlop={8} accessibilityRole="button" className="ml-4">
                <Text className="font-sans-bold text-[14px] text-signal">Undo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : status === 'rejected' ? (
          <Text className="font-sans self-start text-[13px] text-muted">Dismissed. Nothing was changed.</Text>
        ) : (
          <>
            <ProposalCard
              title={view.title}
              fields={view.fields}
              summary={view.summary ?? view.problem ?? undefined}
              status={busy ? 'pending' : status}
              onConfirm={confirm}
              onEdit={() => router.push({ pathname: '/voice', params: { proposalId: proposal.id } })}
            />
            <Pressable
              onPress={async () => {
                setStatus('rejected');
                await markProposal(proposal.id, 'rejected').catch(() => {});
              }}
              hitSlop={8}
              accessibilityRole="button"
              className="self-end px-2"
            >
              <Text className="font-sans-semibold text-[13px] text-muted">Not now</Text>
            </Pressable>
          </>
        )}
        {error ? <Text className="font-sans text-[13px] text-signal">{error}</Text> : null}
      </View>
    );
  }

  if (proposal.kind === 'reminder' && payload.memberId) {
    const p = payload as ReminderPayload;
    const view = describeReminderProposal(p, spaceName);
    const confirm = async () => {
      setBusy(true);
      setError(null);
      try {
        await sendReminder({ memberIds: [p.memberId], tone: p.tone, repeat: p.repeat });
        await markProposal(proposal.id, 'accepted').catch(() => {});
        setStatus('accepted');
        setDoneText(`Reminder sent to ${p.memberName}`);
      } catch (e) {
        setError(aiErrorCopy(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <View className="gap-2">
        {status === 'accepted' ? (
          <View className="self-start rounded-[22px] rounded-bl-[6px] border border-hairline bg-white px-4 py-3">
            <Text className="font-sans-semibold text-[15px] text-ink">{doneText}</Text>
          </View>
        ) : status === 'rejected' ? (
          <Text className="font-sans self-start text-[13px] text-muted">Dismissed. Nothing was sent.</Text>
        ) : (
          <>
            <ProposalCard
              title={view.title}
              fields={view.fields}
              summary={view.summary}
              status={busy ? 'pending' : status}
              onConfirm={confirm}
              onEdit={() => router.push('/reminders')}
            />
            <Pressable
              onPress={async () => {
                setStatus('rejected');
                await markProposal(proposal.id, 'rejected').catch(() => {});
              }}
              hitSlop={8}
              accessibilityRole="button"
              className="self-end px-2"
            >
              <Text className="font-sans-semibold text-[13px] text-muted">Not now</Text>
            </Pressable>
          </>
        )}
        {error ? <Text className="font-sans text-[13px] text-signal">{error}</Text> : null}
      </View>
    );
  }

  return (
    <Card tone="sand" radius={20} padding={14}>
      <Text className="font-sans text-[14px] text-muted">PayMind suggested something this version can't handle yet.</Text>
    </Card>
  );
}
