import { colors } from '@paymind/ui-tokens';
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Brand tokens + derived tints (mirrors tailwind.config.js) for places that need raw hex (icons, SVG, shadows). */
export const palette = {
  oxblood: colors.oxblood,
  signal: colors.signal,
  ink: colors.ink,
  steel: colors.steel,
  clay: colors.clay,
  paper: colors.paper,
  white: colors.white,
  muted: '#6A6459',
  sand: '#EDE7DB',
  peach: '#F6E3D5',
  mist: '#EDF3F6',
  blush: '#FAEBE7',
  slate: '#2F4A5D',
  rust: '#994516',
  plum: '#5B4A78',
  inkSoft: '#2E3442',
  coral: '#E27261',
  stone: '#CBC2B3',
  hairline: '#E9E4DA',
  oxbloodDeep: '#571916',
  brown: '#3A1D0E',
} as const;

export type PaletteKey = keyof typeof palette;

const AVATAR_CYCLE: PaletteKey[] = ['slate', 'rust', 'plum', 'oxblood'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** "You" is always signal; others get a stable colour from their id. */
export function avatarColor(id: string, isYou = false): string {
  if (isYou) return palette.signal;
  return palette[AVATAR_CYCLE[hash(id) % AVATAR_CYCLE.length] as PaletteKey];
}

/** Category bar colours (components.md §1). Unknown categories fall back to stone. */
const CATEGORY_COLORS: Record<string, PaletteKey> = {
  stay: 'oxblood',
  travel: 'slate',
  food: 'clay',
  activities: 'steel',
  transport: 'rust',
  shopping: 'stone',
  other: 'stone',
  education: 'plum',
  groceries: 'clay',
  household_help: 'slate',
  utilities: 'steel',
};

export function categoryColor(slug: string | null | undefined): string {
  const root = (slug ?? 'other').split('.')[0] as string;
  return palette[CATEGORY_COLORS[root] ?? 'stone'];
}
