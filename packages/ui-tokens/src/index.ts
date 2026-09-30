import tokens from '../tokens.json';
import tailwindPresetCjs from '../tailwind-preset.js';

export const colors = tokens.colors;
export const semanticColors = tokens.semantic;
export const fonts = tokens.fonts;
export const fontWeights = tokens.fontWeights;
export const typography = {
  fonts: tokens.fonts,
  weights: tokens.fontWeights,
  sizes: tokens.fontSizes,
};
export const fontSizes = tokens.fontSizes;
export const spacing = tokens.spacing;
export const radii = tokens.radii;

export const theme = {
  colors,
  semantic: semanticColors,
  fonts,
  fontWeights,
  fontSizes,
  spacing,
  radii,
} as const;

export const tailwindPreset = tailwindPresetCjs;
