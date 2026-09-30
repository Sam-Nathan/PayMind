const preset = require('@paymind/ui-tokens/tailwind-preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), preset],
  theme: {
    extend: {
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
