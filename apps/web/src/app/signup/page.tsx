import type { Metadata } from 'next';
import { AuthForm } from '../../components/AuthForm';

export const metadata: Metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <main className="px-4 py-8 md:py-16">
      <AuthForm mode="signup" />
    </main>
  );
}
