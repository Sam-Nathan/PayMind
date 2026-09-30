import type { SpaceType } from '@paymind/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Chip,
  ChipGroup,
  DateField,
  ErrorNote,
  ScreenHeader,
  SPACE_TYPES,
  SPACE_TYPE_ORDER,
  TextField,
} from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import { isIsoDate, parseAmountInput } from '../data/payloads.ts';
import { useCreateSpace } from '../data/useSpaces.ts';

interface MemberRow {
  key: number;
  name: string;
  upi: string;
}

export default function SpaceNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const initial = SPACE_TYPE_ORDER.includes(params.type as SpaceType) ? (params.type as SpaceType) : 'trip';
  const [type, setType] = useState<SpaceType>(initial);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [budget, setBudget] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([{ key: 1, name: '', upi: '' }]);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSpace();
  const info = SPACE_TYPES[type];

  const setMember = (key: number, patch: Partial<MemberRow>) =>
    setMembers((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const submit = async () => {
    setError(null);
    if (info.hasDates) {
      if (startsOn && !isIsoDate(startsOn)) return setError('Start date should look like 2026-10-24.');
      if (endsOn && !isIsoDate(endsOn)) return setError('End date should look like 2026-10-26.');
    }
    const budgetMinor = budget.trim() ? parseAmountInput(budget) : null;
    if (budget.trim() && budgetMinor === null) return setError('Enter the budget as a number, like 15000.');
    try {
      const id = await create.mutateAsync({
        type,
        name,
        startsOn: info.hasDates ? startsOn || null : null,
        endsOn: info.hasDates ? endsOn || null : null,
        budgetMinor: info.hasDates ? budgetMinor : null,
        members: members.map((m) => ({ displayName: m.name, upiVpa: m.upi })),
      });
      router.replace(`/space/${id}`);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}
      >
        <ScreenHeader title="New space" onBack={() => router.back()} />

        <ChipGroup>
          {SPACE_TYPE_ORDER.map((t) => (
            <Chip key={t} label={SPACE_TYPES[t].label} selected={t === type} onPress={() => setType(t)} />
          ))}
        </ChipGroup>
        <View className="rounded-[18px] bg-sand p-3.5">
          <Text className="font-sans text-[14px] leading-5 text-ink">{info.explainer}</Text>
        </View>

        <TextField label="Name" value={name} onChangeText={setName} placeholder={type === 'trip' ? 'Goa Trip' : 'Name your space'} />

        {info.hasDates ? (
          <>
            <DateField label={type === 'event' ? 'Date' : 'Starts'} value={startsOn} onChange={setStartsOn} />
            {type === 'trip' ? <DateField label="Ends" value={endsOn} onChange={setEndsOn} /> : null}
            <TextField label="Budget (optional)" prefix="₹" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="75,000" />
          </>
        ) : null}

        <View className="gap-3">
          <Text className="font-sans-bold text-[18px] text-ink">Who's in it?</Text>
          <Text className="font-sans text-[13px] text-muted">
            You're added automatically. Add friends by name; a UPI ID helps them get paid.
          </Text>
          {members.map((m, i) => (
            <View key={m.key} className="gap-2 rounded-[18px] border border-hairline bg-white p-3">
              <TextField value={m.name} onChangeText={(v) => setMember(m.key, { name: v })} placeholder={`Person ${i + 1}`} />
              <TextField
                value={m.upi}
                onChangeText={(v) => setMember(m.key, { upi: v })}
                placeholder="UPI ID (optional)"
                autoCapitalize="none"
              />
              {members.length > 1 ? (
                <View className="self-start">
                  <Button label="Remove" variant="ghost" size="sm" onPress={() => setMembers((ms) => ms.filter((x) => x.key !== m.key))} />
                </View>
              ) : null}
            </View>
          ))}
          <Button
            label="+ Add a person"
            variant="dashed"
            onPress={() => setMembers((ms) => [...ms, { key: Math.max(0, ...ms.map((x) => x.key)) + 1, name: '', upi: '' }])}
          />
        </View>

        {error ? <ErrorNote message={error} /> : null}
        <Button label={`Create ${info.label.toLowerCase()} space`} size="lg" loading={create.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
