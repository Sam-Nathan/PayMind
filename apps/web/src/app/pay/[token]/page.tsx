import { floorToRupees, groupIndian } from '@paymind/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { QrCode } from '../../../components/QrCode';
import { Disclosure } from '../../../components/ui';
import { inr2 } from '../../../lib/format';
import { resolvePayLink } from '../../../lib/paylink';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const link = await resolvePayLink(token);
  if (!link) {
    return { title: 'Pay link', robots: { index: false, follow: false } };
  }
  const title = `${link.payee_name} is asking for ${inr2(link.amount_minor)}`;
  const description = `Pay ${inr2(link.amount_minor)} to ${link.payee_name} with any UPI app. PayMind never holds your money.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: 'website', siteName: 'PayMind' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PayPage({ params }: Props) {
  const { token } = await params;
  const link = await resolvePayLink(token);

  if (!link) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="card !p-6 text-center">
          <h1 className="text-[22px] font-bold">This pay link isn&apos;t available</h1>
          <p className="mt-2 text-[15px] text-text-muted">
            It may have expired, been cancelled, or the address was copied incompletely. Ask the
            person who sent it for a fresh link.
          </p>
          <Link href="/" className="btn-dark mt-5">
            About PayMind
          </Link>
        </div>
      </main>
    );
  }

  const rupees = groupIndian(String(floorToRupees(link.amount_minor)));
  const paise = link.amount_minor % 100;

  return (
    <main className="mx-auto max-w-md pb-10">
      <div className="dots rounded-b-[40px] bg-hero px-4 pb-10 pt-8 text-center text-text-on-dark">
        <p className="text-[15px] text-text-on-dark-muted">Pay {link.payee_name}</p>
        <p className="mt-3 font-display text-[64px] font-bold leading-none">
          <span className="mr-1 align-top font-sans text-[24px] font-semibold">₹</span>
          {rupees}
          {paise ? <span className="text-[32px]">.{String(paise).padStart(2, '0')}</span> : null}
        </p>
        {link.note_ref ? <p className="mt-3 text-[13px] text-paper/80">Ref {link.note_ref}</p> : null}
      </div>

      <div className="space-y-4 px-4">
        {link.items.length > 0 ? (
          <section className="card -mt-5 !p-0">
            <h2 className="overline px-4 pt-4 text-text-muted">What it covers</h2>
            <ul className="divide-y divide-hairline">
              {link.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{it.description}</p>
                    {it.space ? <p className="truncate text-[13px] text-text-muted">{it.space}</p> : null}
                  </div>
                  <p className="text-[15px] font-bold tabular-nums">{inr2(it.amount_minor)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {link.uri ? (
          <section className="card text-center">
            <a href={link.uri} className="btn-primary w-full !min-h-[56px] text-[17px]">
              Pay {inr2(link.amount_minor)} with UPI
            </a>
            <p className="mt-2 text-[13px] text-text-muted">Opens your UPI app on your phone.</p>
            <div className="mt-5 hidden border-t border-hairline pt-5 md:block">
              <p className="mb-3 text-[14px] font-semibold">On a computer? Scan with your phone</p>
              <QrCode value={link.uri} label={`UPI QR code for ${inr2(link.amount_minor)}`} />
            </div>
            <p className="mt-4 text-[13px] text-text-muted">
              UPI ID: <span className="font-semibold text-ink">{link.upi_vpa}</span>
            </p>
          </section>
        ) : (
          <section className="card text-center text-[15px]">
            {link.payee_name} hasn&apos;t added a valid UPI ID yet. Ask them how they&apos;d like to
            be paid.
          </section>
        )}

        <Disclosure />
        <p className="text-center text-[12px] text-text-muted">
          PayMind isn&apos;t a bank or a wallet and never holds your money.
        </p>
      </div>
    </main>
  );
}
