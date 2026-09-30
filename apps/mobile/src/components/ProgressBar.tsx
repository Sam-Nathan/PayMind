import { View } from 'react-native';
import { palette } from './theme.ts';

export interface ProgressSegment {
  value: number;
  color: string;
}

export interface ProgressBarProps {
  /** 0..1 */
  value?: number;
  /** stacked segments (fractions of the whole) instead of a single fill */
  segments?: ProgressSegment[];
  /** 0..1: 2px ink tick (fair share / even pace) */
  tick?: number;
  height?: 6 | 10 | 12 | 18;
  trackTone?: 'sand' | 'inkSoft';
  fill?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function ProgressBar({
  value = 0,
  segments,
  tick,
  height = 10,
  trackTone = 'sand',
  fill = palette.signal,
}: ProgressBarProps) {
  const track = trackTone === 'inkSoft' ? palette.inkSoft : palette.sand;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(value) * 100) }}
      style={{ height, borderRadius: height, backgroundColor: track, overflow: 'visible' }}
    >
      <View style={{ flex: 1, flexDirection: 'row', borderRadius: height, overflow: 'hidden', gap: segments ? 2 : 0 }}>
        {segments ? (
          segments.map((s, i) => (
            <View key={i} style={{ width: `${clamp(s.value) * 100}%`, backgroundColor: s.color }} />
          ))
        ) : (
          <View style={{ width: `${clamp(value) * 100}%`, backgroundColor: fill, borderRadius: height }} />
        )}
      </View>
      {tick !== undefined ? (
        <View
          style={{
            position: 'absolute',
            left: `${clamp(tick) * 100}%`,
            top: -3,
            bottom: -3,
            width: 2,
            backgroundColor: palette.ink,
          }}
        />
      ) : null}
    </View>
  );
}
