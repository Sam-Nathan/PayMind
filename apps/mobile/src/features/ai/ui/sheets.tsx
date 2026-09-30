import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Chip, ChipGroup, Sheet, TextField } from '../../../components/index.ts';
import { parseAmountInput } from '../../../data/payloads.ts';
import type { Category } from '../../../data/types.ts';
import type { DraftItem } from '../draft.ts';

/** Edit one bill line (or add a missed one): name, qty and the line total in rupees. */
export function ItemEditorSheet({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  /** null = adding a new item */
  item: DraftItem | null;
  onClose: () => void;
  onSave: (v: { name: string; qty: number; amountMinor: number }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setQty(item ? String(item.qty) : '1');
    setAmount(item ? (item.amountMinor / 100).toFixed(2) : '');
    setError(null);
  }, [visible, item]);

  const save = () => {
    const q = Number(qty);
    const a = parseAmountInput(amount);
    if (!name.trim()) return setError('Give the item a name.');
    if (!Number.isFinite(q) || q <= 0) return setError('Quantity should be more than zero.');
    if (a === null) return setError('Enter the line amount in rupees (for all the quantity).');
    onSave({ name: name.trim(), qty: q, amountMinor: a });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={item ? 'Edit item' : 'Add a missed item'}>
      <View className="gap-3">
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Butter Naan" autoCapitalize="words" />
        <View className="flex-row gap-3">
          <View className="w-24">
            <TextField label="Qty" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          </View>
          <View className="flex-1">
            <TextField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="₹" placeholder="240.00" />
          </View>
        </View>
        <Text className="font-sans text-[12px] text-muted">The amount is the line total, for all of the quantity.</Text>
        {error ? <Text className="font-sans text-[13px] text-signal">{error}</Text> : null}
        <View className="flex-row gap-2">
          {item && onDelete ? <Button label="Delete" variant="destructiveOutline" onPress={onDelete} /> : null}
          <Button label="Save" full onPress={save} />
        </View>
      </View>
    </Sheet>
  );
}

/** One text or rupee field in a sheet. */
export function ValueSheet({
  visible,
  title,
  label,
  initial,
  kind = 'text',
  helper,
  allowEmpty,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  label: string;
  initial: string;
  kind?: 'text' | 'rupees';
  helper?: string;
  allowEmpty?: boolean;
  onClose: () => void;
  /** text: the trimmed string; rupees: paise as a string-free number via onSaveMinor */
  onSave: (value: string, minor: number | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setError(null);
    }
  }, [visible, initial]);
  const save = () => {
    if (kind === 'rupees') {
      if (!value.trim() && allowEmpty) return onSave('', 0);
      const minor = parseAmountInput(value);
      if (minor === null) return setError('Enter an amount greater than zero.');
      return onSave(value, minor);
    }
    if (!value.trim() && !allowEmpty) return setError('This can\'t be empty.');
    onSave(value.trim(), null);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View className="gap-3">
        <TextField
          label={label}
          value={value}
          onChangeText={setValue}
          keyboardType={kind === 'rupees' ? 'decimal-pad' : 'default'}
          prefix={kind === 'rupees' ? '₹' : undefined}
          autoCapitalize={kind === 'text' ? 'sentences' : 'none'}
          error={error}
          helper={helper}
          onSubmitEditing={save}
        />
        <Button label="Save" size="lg" onPress={save} />
      </View>
    </Sheet>
  );
}

/** "Food · Dining" style name for a category (children show their parent). */
export function categoryLabel(c: Category, all: readonly Category[]): string {
  const parent = c.parentId ? all.find((p) => p.id === c.parentId) : undefined;
  return parent ? `${parent.name} · ${c.name}` : c.name;
}

/** Pick a category (system categories only, so space members can read them too). */
export function CategorySheet({
  visible,
  categories,
  selectedSlug,
  onClose,
  onPick,
}: {
  visible: boolean;
  categories: readonly Category[];
  selectedSlug: string | null;
  onClose: () => void;
  onPick: (slug: string | null) => void;
}) {
  const system = categories.filter((c) => c.slug);
  return (
    <Sheet visible={visible} onClose={onClose} title="Category">
      <ScrollView style={{ maxHeight: 420 }}>
        <ChipGroup>
          {system.map((c) => (
            <Chip key={c.id} label={categoryLabel(c, categories)} selected={c.slug === selectedSlug} onPress={() => onPick(c.slug)} />
          ))}
        </ChipGroup>
      </ScrollView>
    </Sheet>
  );
}
