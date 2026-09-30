const preset = require('@paymind/ui-tokens/tailwind-preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), preset],
  theme: {
    extend: {
      // Derived design tints (docs/design/components.md §1) that aren't in ui-tokens yet.
      colors: {
        sand: '#EDE7DB',
        peach: '#F6E3D5',
        mist: '#EDF3F6',
        blush: '#FAEBE7',
        slate: '#2F4A5D',
        rust: '#994516',
        plum: '#5B4A78',
        'ink-soft': '#2E3442',
        coral: '#E27261',
        stone: '#CBC2B3',
        hairline: '#E9E4DA',
        'oxblood-deep': '#571916',
        brown: '#3A1D0E',
        muted: '#6A6459',
      },
      // React Native needs the exact loaded font-family name per weight (see src/lib/fonts.ts).
      fontFamily: {
        sans: ['Onest_400Regular'],
        'sans-medium': ['Onest_500Medium'],
        'sans-semibold': ['Onest_600SemiBold'],
        'sans-bold': ['Onest_700Bold'],
        display: ['Doto_700Bold'],
        'display-regular': ['Doto_400Regular'],
      },
    },
  },
  plugins: [],
};
