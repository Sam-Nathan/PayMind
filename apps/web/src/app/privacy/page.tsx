import type { Metadata } from 'next';
import { PagePlaceholder } from '../../components/PagePlaceholder';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl pt-16">
      <PagePlaceholder title="Privacy policy">
        Placeholder. The full policy (required for the Play Store listing) goes here.
      </PagePlaceholder>
    </main>
  );
}
