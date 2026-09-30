import Link from 'next/link';

const LOOP = [
  ['Snap', 'Photograph a bill, say it out loud, or let a payment alert suggest it.'],
  ['Understand', 'Items, taxes and tips are read and odd charges flagged, for you to confirm.'],
  ['Split', 'Equal, by share, by item or by rule. Paise add up exactly.'],
  ['Settle', 'Balances are netted so everyone makes the fewest payments.'],
  ['Pay', 'A UPI link or QR opens your own UPI app, amount and note filled in.'],
  ['Verify', 'Confirm it went through, or mark it paid in cash.'],
  ['Track', 'Budgets, safe-to-spend and a single timeline of everything.'],
  ['Analyze', 'Ask questions about your own money and get plain answers.'],
];

const PRINCIPLES = [
  ['AI proposes, people confirm', 'Nothing is saved as real data until you say so.'],
  ['A gateway, not a wallet', 'PayMind never holds or moves your money.'],
  ['Share the minimum', 'People in a space see only what is shared there, never your personal spending.'],
  ['Explain, don’t accuse', 'Odd charges come with a reason, not a verdict.'],
  ['You can leave', 'Delete your account any time. Shared items stay as “Former member”.'],
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="dots bg-hero px-4 pb-20 pt-6 text-text-on-dark md:px-8 md:pb-28">
        <div className="mx-auto max-w-5xl">
          <nav className="flex items-center justify-between">
            <span className="text-[18px] font-bold tracking-tight">PayMind</span>
            <Link href="/login" className="text-[15px] font-semibold">
              Sign in
            </Link>
          </nav>
          <h1 className="mt-14 max-w-3xl text-[34px] font-bold leading-[1.1] md:text-[52px]">
            Money admin for everyone you share life with — done almost automatically.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] text-text-on-dark-muted">
            Split bills, settle up over UPI and understand your spending, for trips, flats, couples
            and families.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary !min-h-[52px] px-7 text-[16px]">
              Sign up free
            </Link>
            <span
              className="btn border border-paper/30 !min-h-[52px] px-7 text-[16px] text-paper opacity-80"
              aria-disabled="true"
            >
              Get the Android app · coming soon
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 md:px-8">
        <section className="-mt-10 rounded-[28px] bg-ink p-6 text-paper md:p-8">
          <p className="overline text-steel">The core loop</p>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map(([name, text], i) => (
              <li key={name} className="rounded-[18px] bg-ink-soft p-4">
                <p className="font-display text-[28px] font-bold leading-none text-clay">{i + 1}</p>
                <p className="mt-2 text-[17px] font-semibold">{name}</p>
                <p className="mt-1 text-[14px] text-paper/75">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-[24px] font-bold">Principles</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {PRINCIPLES.map(([title, text]) => (
              <li key={title} className="card">
                <p className="text-[17px] font-semibold">{title}</p>
                <p className="mt-1 text-[14.5px] text-text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="my-12 rounded-[28px] bg-sand p-6 text-center md:p-10">
          <h2 className="text-[24px] font-bold">Start a space in a minute</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-text-muted">
            Friends do not need the app to be added. Pay links work in any browser.
          </p>
          <Link href="/signup" className="btn-primary mt-5">
            Create your account
          </Link>
        </section>
      </main>

      <footer className="border-t border-hairline px-4 py-6 text-center text-[14px] text-text-muted">
        PayMind isn&apos;t a bank or a wallet and never holds your money.
        <div className="mt-2">
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>
          {' · '}
          <Link href="/terms" className="underline">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
