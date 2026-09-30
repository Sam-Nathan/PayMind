/**
 * Presentational pieces for the money screens that don't exist in src/components (components.md:
 * BudgetRow, ForecastChart, InsightNoteCard, ScenarioToggleCard, TypeBadge, Switch row) plus the
 * balance sheet. Nothing here fetches data.
 */
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import {
  Button,
  Card,
  ErrorNote,
  ProgressBar,
  Sheet,
  TextField,
  fmtMoney,
  palette,
} from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { parseAmountInput } from '../../data/payloads.ts';
import { DEFAULT_BUFFER_MINOR, useSetManualBalance } from '../../data/useHome.ts';
import type { BudgetRowModel, TimelineBadge } from './logic.ts';

// ---------------------------------------------------------------------------
// BudgetRow (accordion)

export function BudgetRow({
  name,
  spentMinor,
  limitMinor,
  model,
  expanded,
  onToggle,
  onLongPress,
  projectedLabel,
}: {
  name: string;
  spentMinor: number;
  limitMinor: number;
  model: BudgetRowModel;
  expanded: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  /** "31 Oct" */
  projectedLabel: string;
}) {
  const color = model.tone === 'signal' ? palette.signal : palette.slate;
  return (
    <View className={expanded ? 'bg-[#FBF8F2]' : ''}>
      <Pressable
        onPress={onToggle}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}, ${model.statusText}`}
        className="p-4"
      >
        <View className="flex-row items-baseline justify-between">
          <Text className="font-sans-semibold flex-1 text-[15px] text-ink" numberOfLines={1}>
            {name}
          </Text>
          <Text className="font-sans-bold text-[16px] text-ink">
            {fmtMoney(spentMinor)} <Text className="font-sans text-[14px] text-muted">/ {fmtMoney(limitMinor)}</Text>
          </Text>
        </View>
        <View className="my-2.5">
          <ProgressBar value={limitMinor > 0 ? spentMinor / limitMinor : 0} tick={model.tick} fill={color} />
        </View>
        <Text className="font-sans-semibold text-[13px]" style={{ color }}>
          {model.statusText}
        </Text>
        {expanded ? (
          <View className="mt-3 gap-2 rounded-[18px] bg-ink p-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans text-[13px] text-steel">Spending pace</Text>
              <Text className="font-sans-bold text-[14px] text-paper">
                {fmtMoney(model.pace.pacePerDayMinor)}/day vs {fmtMoney(model.pace.plannedPerDayMinor)} planned
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="font-sans text-[13px] text-steel">Projected by {projectedLabel}</Text>
              <Text className="font-sans-bold text-[14px] text-paper">{fmtMoney(model.pace.projectedMinor)}</Text>
            </View>
            <Text className="font-sans text-[14px] leading-[20px] text-paper/85">{model.tip}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ForecastChart

export interface ChartPoint {
  label: string;
  value: number;
}

/** Smooth path through points (horizontal-tangent cubic segments). */
function smoothPath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const mx = (a.x + b.x) / 2;
    d += ` C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  }
  return d;
}

/**
 * Actual months as a smooth paper line, a dashed clay segment to the forecast, and the current month
 * as a full-height steel band. `points` = completed months; the forecast month is appended.
 */
export function ForecastChart({
  points,
  forecastLabel,
  forecastValue,
  width,
  height = 170,
}: {
  points: readonly ChartPoint[];
  forecastLabel: string;
  forecastValue: number;
  width: number;
  height?: number;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const n = points.length + 1;
  const colW = width / n;
  const padTop = 18;
  const padBottom = 28;
  const max = Math.max(1, forecastValue, ...points.map((p) => p.value)) * 1.08;
  const y = (v: number) => padTop + (1 - v / max) * (height - padTop - padBottom);
  const x = (i: number) => colW * i + colW / 2;
  const actual = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const fx = x(n - 1);
  const fy = y(forecastValue);
  const last = actual[actual.length - 1];
  const all = [...points, { label: forecastLabel, value: forecastValue }];
  return (
    <View>
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Rect x={colW * (n - 1) + 2} y={0} width={colW - 4} height={height} rx={16} fill="#AEBCC7" />
          {[0.25, 0.55, 0.85].map((f) => (
            <Line
              key={f}
              x1={0}
              x2={width}
              y1={padTop + f * (height - padTop - padBottom)}
              y2={padTop + f * (height - padTop - padBottom)}
              stroke={palette.inkSoft}
              strokeWidth={1}
            />
          ))}
          {actual.length > 1 ? <Path d={smoothPath(actual)} stroke={palette.paper} strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null}
          {last ? (
            <Line x1={last.x} y1={last.y} x2={fx} y2={fy} stroke={palette.clay} strokeWidth={2.5} strokeDasharray="6 6" strokeLinecap="round" />
          ) : null}
          {actual.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={sel === i ? 5 : 3} fill={palette.paper} />
          ))}
          <Circle cx={fx} cy={fy} r={10} fill="#AEBCC7" stroke={palette.ink} strokeWidth={2} />
          <Circle cx={fx} cy={fy} r={5} fill={palette.ink} />
          {all.map((p, i) => (
            <SvgText
              key={p.label + i}
              x={x(i)}
              y={height - 8}
              fontSize={12}
              fontFamily="Onest_600SemiBold"
              textAnchor="middle"
              fill={i === n - 1 ? palette.ink : palette.steel}
            >
              {p.label}
            </SvgText>
          ))}
        </Svg>
        <View style={{ position: 'absolute', left: 0, top: 0, width, height, flexDirection: 'row' }}>
          {all.map((p, i) => (
            <Pressable
              key={p.label + i}
              style={{ width: colW, height }}
              onPress={() => setSel(sel === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}, ${fmtMoney(p.value)}${i === n - 1 ? ' forecast' : ''}`}
            />
          ))}
        </View>
      </View>
      {sel !== null ? (
        <Text className="font-sans-semibold mt-1 text-center text-[13px] text-steel">
          {all[sel]!.label} · {fmtMoney(all[sel]!.value)}
          {sel === n - 1 ? ' (forecast)' : ''}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recurring / Afford / Timeline bits

export function InsightNoteCard({
  tone,
  title,
  body,
  onPress,
}: {
  tone: 'signal' | 'clay' | 'slate';
  title: string;
  body: string;
  onPress?: () => void;
}) {
  return (
    <Card radius={24} padding={14} onPress={onPress}>
      <View className="flex-row items-center gap-2.5">
        <View className="h-3 w-3 rounded-pill" style={{ backgroundColor: palette[tone] }} />
        <Text className="font-sans-bold flex-1 text-[16px] text-ink">{title}</Text>
      </View>
      <Text className="font-sans mt-1.5 text-[14px] leading-[20px] text-muted">{body}</Text>
    </Card>
  );
}

export function ScenarioToggleCard({
  title,
  subtitle,
  deltaMinor,
  checked,
  onToggle,
  disabled,
}: {
  title: string;
  subtitle: string;
  deltaMinor: number;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      className={`flex-row items-center gap-3 rounded-[22px] border-[1.5px] bg-white p-3.5 ${checked ? 'border-ink' : 'border-hairline'} ${disabled ? 'opacity-50' : ''}`}
    >
      <View className={`h-[26px] w-[26px] items-center justify-center rounded-[8px] border-2 border-ink ${checked ? 'bg-ink' : 'bg-white'}`}>
        {checked ? <Text className="font-sans-bold text-[15px] leading-[18px] text-paper">✓</Text> : null}
      </View>
      <View className="flex-1">
        <Text className="font-sans-semibold text-[16px] text-ink">{title}</Text>
        <Text className="font-sans mt-0.5 text-[13px] text-muted">{subtitle}</Text>
      </View>
      <Text className="font-sans-semibold text-[15px] text-slate">{deltaMinor > 0 ? `+${fmtMoney(deltaMinor)}` : fmtMoney(0)}</Text>
    </Pressable>
  );
}

const BADGE: Record<TimelineBadge, { bg: string; fg: string }> = {
  PAID: { bg: palette.ink, fg: palette.paper },
  ALERT: { bg: palette.signal, fg: palette.white },
  EXP: { bg: palette.sand, fg: palette.oxblood },
  BDGT: { bg: '#F1EDE6', fg: palette.ink },
  SPLIT: { bg: palette.steel, fg: palette.ink },
  GOAL: { bg: palette.clay, fg: palette.ink },
  BILL: { bg: palette.peach, fg: palette.rust },
};

export function TypeBadge({ type }: { type: TimelineBadge }) {
  const c = BADGE[type];
  return (
    <View className="h-11 w-11 items-center justify-center rounded-[14px]" style={{ backgroundColor: c.bg }}>
      <Text className="font-sans-bold text-[11px]" style={{ color: c.fg }}>
        {type}
      </Text>
    </View>
  );
}

export function SwitchRow({ title, description, value, onValueChange, disabled }: { title: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View className="flex-row items-center justify-between rounded-[22px] border border-hairline bg-white p-4">
      <View className="flex-1 pr-3">
        <Text className="font-sans-semibold text-[17px] text-ink">{title}</Text>
        {description ? <Text className="font-sans mt-0.5 text-[13px] text-muted">{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: palette.stone, true: palette.ink }}
        thumbColor={palette.white}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** − amount + stepper (no slider dependency in the app). */
export function Stepper({ valueMinor, stepMinor, onChange, maxMinor }: { valueMinor: number; stepMinor: number; onChange: (v: number) => void; maxMinor?: number }) {
  const max = maxMinor ?? Number.MAX_SAFE_INTEGER;
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        onPress={() => onChange(Math.max(0, valueMinor - stepMinor))}
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        className="h-11 w-11 items-center justify-center rounded-[14px] bg-sand active:opacity-80"
      >
        <Text className="font-sans-bold text-[22px] text-ink">−</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(Math.min(max, valueMinor + stepMinor))}
        accessibilityRole="button"
        accessibilityLabel="Increase"
        className="h-11 w-11 items-center justify-center rounded-[14px] bg-sand active:opacity-80"
      >
        <Text className="font-sans-bold text-[22px] text-ink">+</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Balance sheet: same AsyncStorage source Home uses (useSetManualBalance), so both screens agree.

export function BalanceSheet({
  visible,
  onClose,
  initialBalance,
  initialBuffer,
}: {
  visible: boolean;
  onClose: () => void;
  initialBalance: number | undefined;
  initialBuffer: number | undefined;
}) {
  const set = useSetManualBalance();
  const [balance, setBalance] = useState(initialBalance !== undefined ? String(initialBalance / 100) : '');
  const [buffer, setBuffer] = useState(String((initialBuffer ?? DEFAULT_BUFFER_MINOR) / 100));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const b = balance.trim() === '0' ? 0 : parseAmountInput(balance);
    const buf = buffer.trim() === '0' || buffer.trim() === '' ? 0 : parseAmountInput(buffer);
    if (b === null) return setError('Enter the money you have in your bank accounts now.');
    if (buf === null) return setError('Enter a buffer amount, or 0.');
    setError(null);
    try {
      await set.mutateAsync({ balanceMinor: b, bufferMinor: buf });
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Your balance">
      <View className="gap-3">
        <Text className="font-sans text-[14px] text-muted">
          PayMind can't see your bank yet, so tell us roughly what you have. It stays on this phone.
        </Text>
        <TextField label="Money in your accounts" prefix="₹" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="45,000" />
        <TextField label="Buffer to keep untouched" prefix="₹" value={buffer} onChangeText={setBuffer} keyboardType="decimal-pad" placeholder="5,000" />
        {error ? <ErrorNote message={error} /> : null}
        <Button label="Save" size="lg" loading={set.isPending} onPress={save} />
      </View>
    </Sheet>
  );
}
