import type { Metadata } from 'next';
import { AuthForm } from '../../components/AuthForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="px-4 py-8 md:py-16">
      <AuthForm mode="login" next={next} />
    </main>
  );
}
