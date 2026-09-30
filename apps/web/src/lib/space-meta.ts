import type { SpaceType } from './types';

export const SPACE_TYPES: { value: SpaceType; label: string; blurb: string }[] = [
  {
    value: 'trip',
    label: 'Trip',
    blurb:
      'Dates and a budget. Anything you add during the trip is tagged to it, and you get a full cost report when it ends.',
  },
  { value: 'event', label: 'Event', blurb: 'A date and a budget for a party, wedding or outing.' },
  { value: 'couple', label: 'Couple', blurb: 'Split by a ratio you both agree on, like 60 / 40.' },
  { value: 'family', label: 'Family', blurb: 'Everyone at home, with a household budget.' },
  { value: 'roommates', label: 'Roommates', blurb: 'Rent, bills and groceries between flatmates.' },
  { value: 'friends', label: 'Friends', blurb: 'Dinners, movies and cabs with your group.' },
  { value: 'college', label: 'College', blurb: 'Shared costs with classmates and hostel mates.' },
  { value: 'office', label: 'Office', blurb: 'Team lunches, gifts and outings.' },
  { value: 'custom', label: 'Custom', blurb: 'A name and the people. You decide the rest.' },
];

export const typeLabel = (t: SpaceType) => SPACE_TYPES.find((x) => x.value === t)?.label ?? t;

/** Tile colour per space type (design: roommates mist, couple peach, family sand, friends blush). */
export const TYPE_TILE: Record<SpaceType, string> = {
  trip: 'bg-ink text-clay',
  event: 'bg-ink text-clay',
  couple: 'bg-peach text-rust',
  family: 'bg-sand text-oxblood',
  roommates: 'bg-mist text-slate',
  friends: 'bg-blush text-oxblood',
  college: 'bg-mist text-slate',
  office: 'bg-sand text-ink',
  custom: 'bg-sand text-ink',
};
