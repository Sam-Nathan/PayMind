import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, ErrorNote, Skeleton } from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { useAcceptInvite, usePreviewInvite } from '../../features/spaces/data.ts';
import { parseInviteCode } from '../../features/spaces/logic.ts';
import { FlowScreen } from '../../features/settle/ui.tsx';

/** Opened by `paymind://invite/CODE` (or "Have an invite code?" on the Spaces tab). */
export default function InviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const code = parseInviteCode(raw ?? '');
  const preview = usePreviewInvite(code);
  const accept = useAcceptInvite();
  const [error, setError] = useState<string | null>(null);

  const p = preview.data;
  const onAccept = async () => {
    if (!code) return;
    setError(null);
    try {
      const { spaceId } = await accept.mutateAsync(code);
      router.replace(`/space/${spaceId}`);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const goHome = () => router.replace('/spaces');

  return (
    <FlowScreen title="Join a space" onBack={() => (router.canGoBack() ? router.back() : goHome())}>
      {!code ? (
        <ErrorNote message="That doesn’t look like an invite code. Check the link or code and try again." />
      ) : preview.isPending ? (
        <Skeleton height={180} radius={28} />
      ) : preview.isError ? (
        <>
          <ErrorNote message={friendlyError(preview.error)} onRetry={() => preview.refetch()} />
          <Button label="Back to spaces" variant="outline" onPress={goHome} />
        </>
      ) : p ? (
        <Card radius={28} padding={18}>
          <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-muted">You&apos;re invited</Text>
          <Text className="font-sans-bold mt-2 text-[28px] leading-[34px] text-ink">{p.spaceName}</Text>
          <Text className="font-sans mt-2 text-[15px] leading-[21px] text-muted">
            {p.invitedBy ? `${p.invitedBy} invited you` : 'You were invited'}
            {p.memberName ? ` to join as ${p.memberName}.` : '.'} Everything already split for {p.memberName || 'you'} will show up
            in your balances.
          </Text>
          {!p.usable ? (
            <Text className="font-sans-semibold mt-3 text-[14px] text-signal">
              This invite has already been used or has expired. Ask for a new one.
            </Text>
          ) : null}
          {error ? (
            <Text className="font-sans-semibold mt-3 text-[14px] text-signal">{error}</Text>
          ) : null}
          <Button
            label={`Join ${p.spaceName}`}
            size="lg"
            disabled={!p.usable}
            loading={accept.isPending}
            onPress={onAccept}
            style={{ marginTop: 16 }}
          />
        </Card>
      ) : null}
    </FlowScreen>
  );
}
