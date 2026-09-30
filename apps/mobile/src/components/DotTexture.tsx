import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

/** Absolute-fill overlay of white dots on an 8px grid (hero surfaces). */
export function DotTexture({ opacity = 0.09 }: { opacity?: number }) {
  const id = `dots-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
      <Defs>
        <Pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse">
          <Circle cx={4} cy={4} r={1} fill="#FFFFFF" fillOpacity={opacity} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
