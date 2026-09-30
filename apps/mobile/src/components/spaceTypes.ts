import type { SpaceType } from '@paymind/core';
import { palette, type IconName } from './theme.ts';

export interface SpaceTypeInfo {
  label: string;
  icon: IconName | null;
  /** tile background + icon colour */
  tint: string;
  iconColor: string;
  /** explainer under "Start a space" */
  explainerTitle: string;
  explainer: string;
  /** whether create-space asks for dates + budget */
  hasDates: boolean;
}

export const SPACE_TYPES: Record<SpaceType, SpaceTypeInfo> = {
  trip: {
    label: 'Trip',
    icon: 'airplane-outline',
    tint: palette.sand,
    iconColor: palette.oxblood,
    explainerTitle: 'Trip spaces come with',
    explainer:
      'Dates and a budget. Anything you add during the trip is tagged to it automatically, and you get a full cost report when it ends.',
    hasDates: true,
  },
  event: {
    label: 'Event',
    icon: 'calendar-outline',
    tint: palette.ink,
    iconColor: palette.clay,
    explainerTitle: 'Event spaces come with',
    explainer: 'A date and a budget, so you can see what the party is costing before it happens.',
    hasDates: true,
  },
  couple: {
    label: 'Couple',
    icon: 'heart-outline',
    tint: palette.peach,
    iconColor: palette.rust,
    explainerTitle: 'Couple spaces come with',
    explainer: 'A split ratio you both agree on (like 60 / 40) and shared goals.',
    hasDates: false,
  },
  family: {
    label: 'Family',
    icon: 'people-outline',
    tint: palette.sand,
    iconColor: palette.oxblood,
    explainerTitle: 'Family spaces come with',
    explainer: 'Everyone in the household, plus a household budget and shared goals.',
    hasDates: false,
  },
  roommates: {
    label: 'Roommates',
    icon: 'home-outline',
    tint: palette.mist,
    iconColor: palette.slate,
    explainerTitle: 'Roommate spaces come with',
    explainer: 'Rent and bill rules: split equally, by usage or by room.',
    hasDates: false,
  },
  friends: {
    label: 'Friends',
    icon: null,
    tint: palette.blush,
    iconColor: palette.oxblood,
    explainerTitle: 'Friends spaces come with',
    explainer: 'A name and the people in it. Add dinners, movies and cabs, and settle up whenever.',
    hasDates: false,
  },
  college: {
    label: 'College',
    icon: 'school-outline',
    tint: palette.mist,
    iconColor: palette.slate,
    explainerTitle: 'College spaces come with',
    explainer: 'A name and the people in it, for shared costs on campus.',
    hasDates: false,
  },
  office: {
    label: 'Office',
    icon: 'briefcase-outline',
    tint: palette.sand,
    iconColor: palette.ink,
    explainerTitle: 'Office spaces come with',
    explainer: 'A name and the people in it, for team lunches and collections.',
    hasDates: false,
  },
  custom: {
    label: 'Custom',
    icon: 'apps-outline',
    tint: palette.sand,
    iconColor: palette.ink,
    explainerTitle: 'Custom spaces come with',
    explainer: 'A name and the people in it. You decide what it is for.',
    hasDates: false,
  },
};

export const SPACE_TYPE_ORDER: SpaceType[] = [
  'trip',
  'event',
  'couple',
  'family',
  'roommates',
  'friends',
  'college',
  'office',
  'custom',
];
