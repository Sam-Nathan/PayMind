import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <section className="bg-hero px-6 py-24 text-center text-text-on-dark">
        <p className="font-display text-7xl font-bold">₹1,166</p>
        <h1 className="mt-6 text-4xl font-bold">PayMind</h1>
        <p className="mx-auto mt-3 max-w-md text-text-on-dark-muted">
          Shared money, made calm. Split bills, settle up, and understand your spending.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login" className="rounded-pill bg-signal px-6 py-3 font-semibold text-white">
            Sign in
          </Link>
          <Link href="/app" className="rounded-pill bg-white/10 px-6 py-3 font-semibold text-white">
            Open app
          </Link>
        </div>
      </section>
      <footer className="mt-auto p-6 text-center text-sm text-text-muted">
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
      </footer>
    </main>
  );
}
