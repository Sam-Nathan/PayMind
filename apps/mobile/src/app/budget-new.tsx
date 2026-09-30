import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Chip, ChipGroup, ErrorNote, TextField } from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import { useCreateBudget, type BudgetPeriod, type BudgetScope } from '../data/money.ts';
import { parseAmountInput } from '../data/payloads.ts';
import { useCategories } from '../data/useExpenses.ts';
import { useSpaces } from '../data/useSpaces.ts';

const SCOPES: { value: BudgetScope; label: string; help: string }[] = [
  { value: 'monthly', label: 'Monthly', help: 'One limit for everything you spend in a month.' },
  { value: 'category', label: 'Category', help: 'A monthly limit for one category, such as Food.' },
  { value: 'weekly', label: 'Weekly', help: 'A limit that resets every Monday.' },
  { value: 'group', label: 'Group', help: 'A monthly limit shared with a space.' },
  { value: 'event', label: 'Event', help: 'A limit for an event space.' },
  { value: 'trip', label: 'Trip', help: 'A plan for a trip space.' },
];

const PERIOD: Record<BudgetScope, BudgetPeriod> = {
  monthly: 'monthly',
  category: 'monthly',
  weekly: 'weekly',
  group: 'monthly',
  event: 'custom',
  trip: 'custom',
};

export default function BudgetNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scope?: string }>();
  const initial = SCOPES.find((s) => s.value === params.scope)?.value ?? 'category';
  const [scope, setScope] = useState<BudgetScope>(initial);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [limit, setLimit] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cats = useCategories();
  const spaces = useSpaces();
  const create = useCreateBudget();

  const roots = useMemo(() => (cats.data ?? []).filter((c) => !c.parentId), [cats.data]);
  const spaceChoices = useMemo(() => {
    const all = (spaces.data ?? []).filter((s) => s.status === 'active' || s.status === 'settling');
    if (scope === 'trip') return all.filter((s) => s.type === 'trip');
    if (scope === 'event') return all.filter((s) => s.type === 'event');
    if (scope === 'group') return all.filter((s) => s.type !== 'trip' && s.type !== 'event');
    return [];
  }, [spaces.data, scope]);

  const needsSpace = scope === 'group' || scope === 'event' || scope === 'trip';
  const info = SCOPES.find((s) => s.value === scope)!;

  const save = async () => {
    const limitMinor = parseAmountInput(limit);
    if (limitMinor === null) return setError('Enter a limit greater than zero.');
    if (scope === 'category' && !categoryId) return setError('Pick a category for this budget.');
    if (needsSpace && !spaceId) return setError(`Pick the ${scope === 'group' ? 'space' : scope} this budget is for.`);
    const space = spaceChoices.find((s) => s.id === spaceId);
    setError(null);
    try {
      await create.mutateAsync({
        scope,
        period: PERIOD[scope],
        name: name.trim() || null,
        categoryId: scope === 'category' ? categoryId : null,
        spaceId: needsSpace ? spaceId : null,
        limitMinor,
        startsOn: PERIOD[scope] === 'custom' ? (space?.startsOn ?? null) : null,
        endsOn: PERIOD[scope] === 'custom' ? (space?.endsOn ?? null) : null,
      });
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View>
          <Text className="font-sans-semibold mb-2 text-[13px] text-muted">Budget for</Text>
          <ChipGroup>
            {SCOPES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                selected={scope === s.value}
                onPress={() => {
                  setScope(s.value);
                  setSpaceId(null);
                }}
              />
            ))}
          </ChipGroup>
          <Text className="font-sans mt-2 text-[13px] text-muted">{info.help}</Text>
        </View>

        {scope === 'category' ? (
          <View>
            <Text className="font-sans-semibold mb-2 text-[13px] text-muted">Category</Text>
            <ChipGroup>
              {roots.map((c) => (
                <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </ChipGroup>
            <Text className="font-sans mt-2 text-[13px] text-muted">Includes its sub-categories, such as café and dining under Food.</Text>
          </View>
        ) : null}

        {needsSpace ? (
          <View>
            <Text className="font-sans-semibold mb-2 text-[13px] text-muted">{scope === 'group' ? 'Space' : scope === 'event' ? 'Event' : 'Trip'}</Text>
            {spaceChoices.length === 0 ? (
              <Text className="font-sans text-[14px] text-muted">No matching spaces yet. Create one from the Spaces tab first.</Text>
            ) : (
              <ChipGroup>
                {spaceChoices.map((s) => (
                  <Chip key={s.id} label={s.name} selected={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
                ))}
              </ChipGroup>
            )}
          </View>
        ) : null}

        <TextField
          label={scope === 'weekly' ? 'Weekly limit' : scope === 'trip' || scope === 'event' ? 'Budget' : 'Monthly limit'}
          prefix="₹"
          value={limit}
          onChangeText={setLimit}
          keyboardType="decimal-pad"
          placeholder="8,000"
        />
        <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder={scope === 'category' ? 'Food & dining' : 'Groceries'} />

        {error ? <ErrorNote message={error} /> : null}
        <Button label="Save budget" size="lg" loading={create.isPending} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
