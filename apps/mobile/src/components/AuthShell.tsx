import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { HeroHeader } from './HeroHeader.tsx';

/** Oxblood hero with the Doto wordmark + a scrollable form body. Used by sign-in/up/onboarding. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <HeroHeader minHeight={260}>
          <View className="mt-10 items-center">
            <Text className="font-display text-[56px] leading-[60px] text-paper">PayMind</Text>
            <Text className="font-sans mt-2 text-[14px] text-paper/80">Money, minded.</Text>
          </View>
        </HeroHeader>
        <View className="gap-4 px-4 pb-10 pt-6">
          <View>
            <Text className="font-sans-bold text-[28px] text-ink">{title}</Text>
            {subtitle ? <Text className="font-sans mt-1 text-[15px] text-muted">{subtitle}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
