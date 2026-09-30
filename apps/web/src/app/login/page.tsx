import type { Metadata } from 'next';
import { PagePlaceholder } from '../../components/PagePlaceholder';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md pt-24">
      <PagePlaceholder title="Sign in">Phone OTP, Google, Apple — coming soon.</PagePlaceholder>
    </main>
  );
}
