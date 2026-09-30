import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  MemberAvatar,
  Skeleton,
  TextField,
} from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import { useSpace, useSpaceMembers } from '../data/useSpaces.ts';
import { useAddPlaceholderMember, useCreateInvite } from '../features/spaces/data.ts';
import { inviteMessage } from '../features/spaces/logic.ts';
import { FlowScreen } from '../features/settle/ui.tsx';

/** Invite someone into a space: pick the placeholder person they are, get a link + code to share. */
export default function SpaceInviteScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const router = useRouter();
  const space = useSpace(spaceId);
  const members = useSpaceMembers(spaceId);
  const create = useCreateInvite();
  const add = useAddPlaceholderMember(spaceId);

  const [picked, setPicked] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // People who are not on the app yet (no linked user) and still in the space.
  const candidates = (members.data ?? []).filter((m) => !m.userId && !m.leftAt);
  const chosen = candidates.find((m) => m.id === picked) ?? null;
  const spaceName = space.data?.name ?? 'my space';

  const onCreate = async () => {
    if (!spaceId || !chosen) return;
    setError(null);
    try {
      setCode(await create.mutateAsync({ spaceId, memberId: chosen.id }));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const onAdd = async () => {
    setError(null);
    try {
      const id = await add.mutateAsync(newName);
      setNewName('');
      setPicked(id);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const shareIt = (c: string) => Share.share({ message: inviteMessage(spaceName, c) }).catch(() => {});

  return (
    <FlowScreen title="Invite" onBack={() => router.back()}>
      {space.isPending || members.isPending ? (
        <Skeleton height={180} radius={24} />
      ) : code && chosen ? (
        <Card radius={28} padding={18}>
          <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-muted">Invite for {chosen.displayName}</Text>
          <Text className="font-sans-bold mt-2 text-[34px] tracking-[4px] text-ink" selectable>
            {code}
          </Text>
          <Text className="font-sans mt-2 text-[15px] leading-[21px] text-muted">{inviteMessage(spaceName, code)}</Text>
          <Text className="font-sans mt-2 text-[13px] leading-[18px] text-muted">
            When they accept, they become {chosen.displayName} in {spaceName}, with everything already split for them.
          </Text>
          <View className="mt-4 gap-2">
            <Button label="Share invite" size="lg" iconRight="share-outline" onPress={() => shareIt(code)} />
            <Button
              label="Invite someone else"
              variant="outline"
              onPress={() => {
                setCode(null);
                setPicked(null);
              }}
            />
          </View>
        </Card>
      ) : (
        <>
          <Text className="font-sans text-[15px] leading-[21px] text-muted">
            Pick the person you&apos;re inviting. They take over that name in {spaceName}, so their shares and balances are
            ready when they join.
          </Text>
          {candidates.length === 0 ? (
            <Card>
              <EmptyState
                title="Everyone here is already on PayMind"
                body="To invite someone new, add their name below first."
              />
            </Card>
          ) : (
            <Card radius={24} padding={0}>
              {candidates.map((m, i) => {
                const on = m.id === picked;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setPicked(m.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    className={`min-h-[64px] flex-row items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-[#F2F0EA]' : ''}`}
                  >
                    <MemberAvatar id={m.id} name={m.displayName} size={44} />
                    <Text className="font-sans-semibold flex-1 text-[16px] text-ink">{m.displayName}</Text>
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-pill border-2 ${on ? 'border-signal' : 'border-stone'}`}
                    >
                      {on ? <View className="h-3 w-3 rounded-pill bg-signal" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          )}

          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <TextField label="Add someone new" value={newName} onChangeText={setNewName} placeholder="Name" />
            </View>
            <Button label="Add" variant="dark" loading={add.isPending} disabled={!newName.trim()} onPress={onAdd} />
          </View>

          {error ? <ErrorNote message={error} /> : null}
          <Button label="Create invite" size="lg" disabled={!chosen} loading={create.isPending} onPress={onCreate} />
        </>
      )}
    </FlowScreen>
  );
}
