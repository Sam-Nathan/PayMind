import type { Metadata } from 'next';
import { PagePlaceholder } from '../../../components/PagePlaceholder';

export const metadata: Metadata = { title: 'Pay' };

// Public pay-link page (no login). Will resolve the token server-side and show a UPI QR / deep link.
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-md pt-24">
      <PagePlaceholder title="Pay">Pay link: {token}</PagePlaceholder>
    </main>
  );
}
