import { upiAppTargets } from '@paymind/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  Card,
  ErrorNote,
  Skeleton,
  StatusPill,
  TextField,
  fmtMoney,
  palette,
} from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { useAllMembers, useSettlement, useSettlements, useUpdateSettlementStatuses } from '../../data/settle.ts';
import { useSpaces } from '../../data/useSpaces.ts';
import {
  answerState,
  firstName,
  isUuid,
  statusFromUpiResult,
  verifyTimeline,
  type VerifyAnswer,
} from '../../features/settle/logic.ts';
import { FlowScreen } from '../../features/settle/ui.tsx';

const UTR = /^[A-Za-z0-9]{8,24}$/;

export default function VerifyScreen() {
  const { id, ids: idsParam, result, app } = useLocalSearchParams<{
    id: string;
    ids?: string;
    result?: string;
    app?: string;
  }>();
  const router = useRouter();
  const settlement = useSettlement(isUuid(id) ? id : undefined);
  const members = useAllMembers();
  const spaces = useSpaces();
  const update = useUpdateSettlementStatuses();
  const [utr, setUtr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const ids = useMemo(() => {
    const list = (idsParam ?? '').split(',').filter(isUuid);
    return list.length > 0 ? list : isUuid(id) ? [id] : [];
  }, [idsParam, id]);

  const s = settlement.data;
  const payee = members.data?.find((m) => m.id === s?.toMember);
  const payeeName = payee?.displayName ?? 'them';
  const spaceName = spaces.data?.find((x) => x.id === s?.spaceId)?.name;
  const appId = s?.upiApp ?? app ?? null;
  const appName = appId && appId !== 'other' ? (upiAppTargets.find((a) => a.id === appId)?.name ?? null) : null;
  // A combined payment spans one settlement per space; the question is about the whole amount.
  const all = useSettlements();
  const amount = useMemo(() => {
    if (ids.length <= 1) return s?.amountMinor ?? 0;
    const sum = (all.data ?? []).filter((x) => ids.includes(x.id)).reduce((t, x) => t + x.amountMinor, 0);
    return sum || (s?.amountMinor ?? 0);
  }, [ids, all.data, s?.amountMinor]);

  // The UPI app gave a definitive answer: record it without asking (design: skip the question).
  const auto = statusFromUpiResult(result);
  useEffect(() => {
    if (autoRan.current || !s || !auto || auto === 'pending') return;
    autoRan.current = true;
    const { allowed } = answerState(s.status, auto);
    if (!allowed || s.status === auto) return;
    update
      .mutateAsync({ ids, status: auto })
      .then(() => settlement.refetch())
      .catch((e) => setError(friendlyError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, auto]);

  const answer = async (a: VerifyAnswer) => {
    if (!s) return;
    const cleanUtr = utr.trim();
    if (cleanUtr && !UTR.test(cleanUtr)) return setError('That reference doesn’t look right. Check it in your UPI app.');
    const { allowed } = answerState(s.status, a);
    if (!allowed) return setError('That can’t be changed from the current status.');
    setError(null);
    try {
      if (s.status !== a || cleanUtr) {
        await update.mutateAsync({ ids, status: a, utr: cleanUtr || null });
      }
      if (a === 'completed') {
        router.replace({ pathname: '/settle', params: { toast: `Marked ${fmtMoney(amount)} to ${firstName(payeeName)} as paid.` } });
      } else if (a === 'pending') {
        router.replace({ pathname: '/settle', params: { toast: 'Kept as pending. Check your UPI app again later.' } });
      } else {
        await settlement.refetch();
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const cancelPayment = async () => {
    setError(null);
    try {
      await update.mutateAsync({ ids, status: 'cancelled' });
      router.replace('/settle');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const status = s?.status;
  const open = status === 'initiated' || status === 'pending';
  const done = status === 'completed' || status === 'confirmed_manual' || status === 'corrected';
  const timeline = s
    ? verifyTimeline({
        status: s.status,
        amountMinor: amount,
        vpa: payee?.upiVpa ?? null,
        noteRef: s.noteRef,
        appName,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        completedAt: s.completedAt,
      })
    : [];

  return (
    <FlowScreen title={appName ? `Back from ${appName}` : 'Back from your UPI app'} onBack={() => router.replace('/settle')}>
      {settlement.isPending || members.isPending ? (
        <>
          <Skeleton height={190} radius={28} />
          <Skeleton height={200} radius={24} />
        </>
      ) : !s ? (
        <ErrorNote message="We couldn't find that payment." onRetry={() => settlement.refetch()} />
      ) : (
        <>
          <Card radius={28} padding={18}>
            <View className="self-start">
              {open ? (
                <StatusPill
                  status={s.status}
                  label={s.status === 'pending' ? 'PENDING' : 'NOT CONFIRMED YET'}
                />
              ) : (
                <StatusPill status={s.status} />
              )}
            </View>
            {open ? (
              <>
                <Text className="font-sans-bold mt-3 text-[27px] leading-[32px] text-ink">
                  Did {fmtMoney(amount, amount % 100 === 0 ? 0 : 2)} reach {firstName(payeeName)}?
                </Text>
                <Text className="font-sans mt-2 text-[15px] leading-[21px] text-muted">
                  {appName ?? 'Your UPI app'} didn&apos;t send a result back. That happens — tell us what you saw and
                  we&apos;ll update {spaceName ?? 'your space'}.
                </Text>
              </>
            ) : done ? (
              <>
                <Text className="font-sans-bold mt-3 text-[27px] leading-[32px] text-ink">
                  {fmtMoney(amount, amount % 100 === 0 ? 0 : 2)} to {firstName(payeeName)} is recorded.
                </Text>
                <Text className="font-sans mt-2 text-[15px] leading-[21px] text-muted">
                  Balances in {spaceName ?? 'your space'} are updated. {firstName(payeeName)} can see it too.
                </Text>
              </>
            ) : status === 'failed' ? (
              <>
                <Text className="font-sans-bold mt-3 text-[27px] leading-[32px] text-ink">That payment didn&apos;t go through.</Text>
                <Text className="font-sans mt-2 text-[15px] leading-[21px] text-muted">
                  Nothing was recorded against your balance. If the money did leave your account, mark it as
                  paid; otherwise try again or cancel it.
                </Text>
              </>
            ) : (
              <Text className="font-sans-bold mt-3 text-[22px] text-ink">This payment was cancelled.</Text>
            )}
          </Card>

          <Card radius={24} padding={16}>
            {timeline.map((e, i) => {
              const last = i === timeline.length - 1;
              return (
                <View key={i} className="flex-row gap-3">
                  <View className="items-center">
                    <View
                      className="h-3 w-3 rounded-pill"
                      style={{ backgroundColor: last && e.open ? palette.clay : palette.ink, marginTop: 5 }}
                    />
                    {!last ? <View className="w-0.5 flex-1 bg-sand" /> : null}
                  </View>
                  <View className={last ? '' : 'pb-4'}>
                    <Text className="font-sans-semibold text-[15px] text-ink">{e.title}</Text>
                    <Text className="font-sans mt-0.5 text-[12px] text-muted">{e.sub}</Text>
                  </View>
                </View>
              );
            })}
          </Card>

          {open ? (
            <>
              <Button
                label="Yes, it went through"
                variant="dark"
                size="lg"
                loading={update.isPending}
                disabled={!answerState(s.status, 'completed').allowed}
                onPress={() => answer('completed')}
              />
              <View className="flex-row gap-3">
                <Button
                  label="Still pending"
                  variant="outline"
                  full
                  disabled={update.isPending || !answerState(s.status, 'pending').allowed}
                  onPress={() => answer('pending')}
                />
                <Button
                  label="It failed"
                  variant="outline"
                  full
                  disabled={update.isPending || !answerState(s.status, 'failed').allowed}
                  onPress={() => answer('failed')}
                />
              </View>
              <TextField
                label="Optional: UPI reference (UTR) from your app"
                value={utr}
                onChangeText={setUtr}
                placeholder="12-digit reference"
                keyboardType="number-pad"
                autoCapitalize="characters"
              />
            </>
          ) : status === 'failed' ? (
            <>
              {/* UPI apps often report a failure for a payment that completes minutes later;
                  the DB (and core) allow failed -> completed for exactly this case. */}
              <Button
                label="It went through after all"
                variant="dark"
                size="lg"
                loading={update.isPending}
                disabled={!answerState(s.status, 'completed').allowed}
                onPress={() => answer('completed')}
              />
              <TextField
                label="Optional: UPI reference (UTR) from your app"
                value={utr}
                onChangeText={setUtr}
                placeholder="12-digit reference"
                autoCapitalize="characters"
              />
              <Button
                label="Try again"
                size="lg"
                onPress={() => router.replace({ pathname: '/pay/[id]', params: { id: s.id } })}
              />
              <Button label="Cancel this payment" variant="outline" loading={update.isPending} onPress={cancelPayment} />
            </>
          ) : (
            <Button label="Back to settle up" variant="dark" size="lg" onPress={() => router.replace('/settle')} />
          )}

          {error ? <ErrorNote message={error} /> : null}
        </>
      )}
    </FlowScreen>
  );
}
