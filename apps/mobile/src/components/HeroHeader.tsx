import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DotTexture } from './DotTexture.tsx';

export interface HeroHeaderProps {
  tone?: 'oxblood' | 'ink';
  children: ReactNode;
  /** px the next row overlaps this header (extra bottom padding; the screen applies the negative margin). */
  overlap?: number;
  minHeight?: number;
}

/** Full-bleed hero surface: dot texture, 40px bottom corners, safe-area aware top padding. */
export function HeroHeader({ tone = 'oxblood', children, overlap = 0, minHeight }: HeroHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`overflow-hidden rounded-b-[40px] px-4 ${tone === 'ink' ? 'bg-ink' : 'bg-hero'}`}
      style={{ paddingTop: insets.top + 8, paddingBottom: 24 + overlap, minHeight }}
    >
      <DotTexture />
      {children}
    </View>
  );
}
