import { Text, View } from 'react-native';
import { Button, type ButtonVariant } from './Button.tsx';
import { Card } from './Card.tsx';
import { Overline } from './Text.tsx';

export interface InsightAction {
  label: string;
  variant?: Extract<ButtonVariant, 'paperOnInk' | 'ghostOnInk'>;
  onPress: () => void;
}

export function InsightCard({
  overline,
  headline,
  body,
  actions = [],
  tone = 'ink',
}: {
  overline: string;
  headline: string;
  body?: string;
  actions?: InsightAction[];
  tone?: 'ink' | 'oxblood';
}) {
  return (
    <Card tone={tone} radius={28} padding={18} texture={tone === 'oxblood'}>
      <Overline tone="steel" icon="sparkles-outline">
        {overline}
      </Overline>
      <Text className="font-sans-semibold mt-3 text-[19px] leading-[25px] text-paper">{headline}</Text>
      {body ? <Text className="font-sans mt-2 text-[15px] leading-[21px] text-paper/80">{body}</Text> : null}
      {actions.length > 0 ? (
        <View className="mt-4 flex-row gap-2">
          {actions.slice(0, 2).map((a, i) => (
            <Button
              key={a.label}
              label={a.label}
              size="sm"
              full
              variant={a.variant ?? (i === 0 ? 'paperOnInk' : 'ghostOnInk')}
              onPress={a.onPress}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
