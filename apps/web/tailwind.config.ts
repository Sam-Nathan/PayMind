import type { Config } from 'tailwindcss';
import preset from '@paymind/ui-tokens/tailwind-preset';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [preset as unknown as Partial<Config>],
  theme: {
    extend: {
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
