import type { Config } from 'tailwindcss';
import preset from '@paymind/ui-tokens/tailwind-preset';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [preset as unknown as Partial<Config>],
  theme: {
    extend: {
      // Derived tints used by the design (docs/design/components.md §1) that the shared preset lacks.
      colors: {
        sand: '#EDE7DB',
        peach: '#F6E3D5',
        mist: '#EDF3F6',
        blush: '#FAEBE7',
        slate: '#2F4A5D',
        rust: '#994516',
        plum: '#5B4A78',
        'ink-soft': '#2E3442',
        stone: '#CBC2B3',
        hairline: '#E9E4DA',
        'oxblood-deep': '#571916',
      },
      // next/font exposes generated family names through CSS variables (see src/app/layout.tsx).
      fontFamily: {
        sans: ['var(--font-onest)', 'system-ui', 'sans-serif'],
        display: ['var(--font-doto)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
