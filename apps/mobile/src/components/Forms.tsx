import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import { isIsoDate } from '../data/payloads.ts';
import { addDays, toIsoDate } from '../data/dates.ts';
import { Chip, ChipGroup } from './Chip.tsx';
import { palette } from './theme.ts';

export interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  error?: string | null;
  helper?: string;
  emphasis?: 'ink2';
  prefix?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  autoComplete,
  textContentType,
  error,
  helper,
  emphasis,
  prefix,
  onSubmitEditing,
  returnKeyType,
  testID,
}: TextFieldProps) {
  const border = error ? 'border-signal border-[1.5px]' : emphasis === 'ink2' ? 'border-2 border-ink' : 'border-hairline border';
  return (
    <View>
      {label ? <Text className="font-sans-semibold mb-1.5 text-[13px] text-muted">{label}</Text> : null}
      <View className={`h-[52px] flex-row items-center rounded-2xl bg-white px-4 ${border}`}>
        {prefix ? <Text className="font-sans-semibold mr-1 text-[16px] text-muted">{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.stone}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          testID={testID}
          accessibilityLabel={label ?? placeholder}
          className="font-sans flex-1 text-[16px] text-ink"
        />
      </View>
      {error ? (
        <Text className="font-sans mt-1 text-[12px] text-signal">{error}</Text>
      ) : helper ? (
        <Text className="font-sans mt-1 text-[12px] text-muted">{helper}</Text>
      ) : null}
    </View>
  );
}

/** YYYY-MM-DD text field with Today / Yesterday shortcuts (no native date picker dependency). */
export function DateField({
  label,
  value,
  onChange,
  shortcuts = true,
  error,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  shortcuts?: boolean;
  error?: string | null;
}) {
  const today = toIsoDate(new Date());
  const yesterday = toIsoDate(addDays(new Date(), -1));
  const invalid = value.length > 0 && !isIsoDate(value);
  return (
    <View>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        error={error ?? (invalid ? 'Use the format YYYY-MM-DD' : null)}
      />
      {shortcuts ? (
        <View className="mt-2">
          <ChipGroup>
            <Chip label="Today" selected={value === today} onPress={() => onChange(today)} />
            <Chip label="Yesterday" selected={value === yesterday} onPress={() => onChange(yesterday)} />
          </ChipGroup>
        </View>
      ) : null}
    </View>
  );
}

/** Bottom sheet (paper bg, 28px top radius, grabber). */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} accessibilityLabel="Close" />
        <View className="max-h-[85%] rounded-t-[28px] bg-paper px-4 pb-8 pt-3">
          <View className="mb-3 h-1 w-10 self-center rounded-pill bg-stone" />
          {title ? <Text className="font-sans-bold mb-3 text-[20px] text-ink">{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
