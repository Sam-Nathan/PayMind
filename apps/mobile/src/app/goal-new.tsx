import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Chip, ChipGroup, DateField, ErrorNote, SegmentedControl, TextField } from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import { useCreateGoal } from '../data/money.ts';
import { isIsoDate, parseAmountInput } from '../data/payloads.ts';
import { useSpaceMembers, useSpaces } from '../data/useSpaces.ts';

type Kind = 'personal' | 'shared';

export default function GoalNewScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<Kind>('personal');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spaces = useSpaces();
  const members = useSpaceMembers(kind === 'shared' ? (spaceId ?? undefined) : undefined);
  const create = useCreateGoal();

  const choices = useMemo(() => (spaces.data ?? []).filter((s) => s.status === 'active' || s.status === 'settling'), [spaces.data]);
  const active = (members.data ?? []).filter((m) => !m.leftAt);
  const totalWeight = active.reduce((a, m) => a + (m.shareWeight > 0 ? m.shareWeight : 1), 0);

  const save = async () => {
    const targetMinor = parseAmountInput(target);
    if (!name.trim()) return setError('Give the goal a name.');
    if (targetMinor === null) return setError('Enter a target amount greater than zero.');
    if (date && !isIsoDate(date)) return setError('Use the date format YYYY-MM-DD, or leave it empty.');
    if (kind === 'shared' && !spaceId) return setError('Pick the space to share this goal with.');
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), targetMinor, targetDate: date || null, spaceId: kind === 'shared' ? spaceId : null });
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <TextField label="Goal name" value={name} onChangeText={setName} placeholder="Kashmir trip" />
        <TextField label="Target" prefix="₹" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="1,20,000" />
        <DateField label="Target date (optional)" value={date} onChange={setDate} shortcuts={false} />

        <View>
          <Text className="font-sans-semibold mb-2 text-[13px] text-muted">Who is saving</Text>
          <SegmentedControl<Kind>
            options={[
              { value: 'personal', label: 'Just me' },
              { value: 'shared', label: 'Shared with a space' },
            ]}
            value={kind}
            onChange={setKind}
          />
        </View>

        {kind === 'shared' ? (
          <View>
            {choices.length === 0 ? (
              <Text className="font-sans text-[14px] text-muted">You have no active spaces yet. Create one from the Spaces tab.</Text>
            ) : (
              <ChipGroup>
                {choices.map((s) => (
                  <Chip key={s.id} label={s.name} selected={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
                ))}
              </ChipGroup>
            )}
            {spaceId && active.length > 0 ? (
              <Text className="font-sans mt-3 text-[14px] leading-[20px] text-muted">
                Each deposit is split by the space's ratio:{' '}
                {active.map((m) => `${m.displayName} ${Math.round(((m.shareWeight > 0 ? m.shareWeight : 1) / totalWeight) * 100)}%`).join(' · ')}.
                Change the ratio in the space's settings.
              </Text>
            ) : null}
          </View>
        ) : null}

        {error ? <ErrorNote message={error} /> : null}
        <Button label="Create goal" size="lg" loading={create.isPending} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
