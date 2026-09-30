import { formatINR } from '@paymind/core';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Chip, ChipGroup, ErrorNote, Sheet, TextField } from '../../components/index.ts';
import { parseAmountInput } from '../../data/payloads.ts';
import { friendlyError } from '../../data/errors.ts';
import { useRecordManualSettlements } from '../../data/settle.ts';
import { allocatePayment, firstName, noteRefFor, type PersonPlan } from './logic.ts';

type Method = 'cash' | 'bank' | 'other';
const METHODS: { value: Method; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

/** "Paid in cash" / "Paid another way": records confirmed_manual settlements for what you owe a person. */
export function ManualSheet({
  person,
  initialMethod,
  onClose,
  onDone,
}: {
  person: PersonPlan | null;
  initialMethod: Method;
  onClose: () => void;
  onDone: () => void;
}) {
  const record = useRecordManualSettlements();
  const [method, setMethod] = useState<Method>(initialMethod);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const personKeyNow = person?.key;
  const owedNow = person?.amountMinor;
  useEffect(() => {
    if (personKeyNow !== undefined && owedNow !== undefined) {
      setMethod(initialMethod);
      setAmount((owedNow / 100).toFixed(2).replace(/\.00$/, ''));
      setNote('');
      setError(null);
    }
  }, [personKeyNow, owedNow, initialMethod]);

  if (!person) return null;
  const parsed = parseAmountInput(amount);
  const tooMuch = parsed !== null && parsed > person.amountMinor;

  const submit = async () => {
    if (parsed === null) return setError('Enter the amount you paid.');
    if (tooMuch) return setError(`You only owe ${formatINR(person.amountMinor, { decimals: 'auto' })}.`);
    const items = allocatePayment(person.items, parsed);
    const first = person.items[0];
    const ref = first ? noteRefFor(first.spaceName, new Date()) : null;
    const noteRef = note.trim() ? `${ref ?? 'PM'} · ${note.trim()}`.slice(0, 80) : ref;
    try {
      await record.mutateAsync({ items, method, noteRef });
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={method === 'cash' ? `Paid ${firstName(person.name)} in cash` : `Paid ${firstName(person.name)} another way`}
    >
      <View className="gap-3">
        <TextField
          label="Amount"
          prefix="₹"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          error={tooMuch ? `You only owe ${formatINR(person.amountMinor, { decimals: 'auto' })}` : null}
          helper={
            parsed !== null && parsed < person.amountMinor
              ? 'Less than you owe. The rest stays open.'
              : `You owe ${formatINR(person.amountMinor, { decimals: 'auto' })}`
          }
        />
        <View>
          <Text className="font-sans-semibold mb-1.5 text-[13px] text-muted">How did you pay?</Text>
          <ChipGroup>
            {METHODS.map((m) => (
              <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />
            ))}
          </ChipGroup>
        </View>
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. gave it at lunch" />
        {error ? <ErrorNote message={error} /> : null}
        <Button label="Mark as paid" size="lg" loading={record.isPending} onPress={submit} />
      </View>
    </Sheet>
  );
}
