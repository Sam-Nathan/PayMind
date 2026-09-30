/**
 * Shared Tailwind preset (CommonJS) for NativeWind (apps/mobile) and Next.js (apps/web).
 * Single source of truth: ./tokens.json (also re-exported as typed TS from src/).
 */
const tokens = require('./tokens.json');

const px = (n) => `${n}px`;
const mapPx = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, px(v)]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        ...tokens.colors,
        // semantic aliases -> bg-bg, bg-surface, text-text-muted, bg-owed-to-you, ...
        bg: tokens.semantic.bg,
        surface: tokens.semantic.surface,
        hero: tokens.semantic.hero,
        text: {
          DEFAULT: tokens.semantic.text,
          muted: tokens.semantic.textMuted,
          'on-dark': tokens.semantic.textOnDark,
          'on-dark-muted': tokens.semantic.textOnDarkMuted,
        },
        border: tokens.semantic.border,
        primary: tokens.semantic.primary,
        action: tokens.semantic.action,
        danger: tokens.semantic.danger,
        'owed-to-you': tokens.semantic.owedToYou,
        'you-owe': tokens.semantic.youOwe,
        budget: tokens.semantic.budget,
      },
      fontFamily: {
        // `font-display` = Doto (hero numbers only); `font-sans` = Onest (everything else).
        // On native, weights map to loaded font family names (see apps/mobile/src/lib/fonts.ts).
        display: [tokens.fonts.display, 'monospace'],
        sans: [tokens.fonts.body, 'system-ui', 'sans-serif'],
      },
      fontSize: { ...mapPx(tokens.fontSizes) },
      spacing: { ...mapPx(tokens.spacing) },
      borderRadius: { ...mapPx(tokens.radii) },
    },
  },
};
