import { Doto_700Bold } from '@expo-google-fonts/doto/700Bold';
import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';

/**
 * Fonts loaded before the splash screen hides. Doto is for hero numbers ONLY
 * (`font-display`, 700 only); Onest (`font-sans*`) is for everything else. Only weights that a
 * class actually uses are loaded: each one is a font file in the bundle and a splash-screen wait.
 */
export const fontMap = {
  Doto_700Bold,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
};
