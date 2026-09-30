import type { Metadata, Viewport } from 'next';
import { Doto, Onest } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Doto: hero numbers only (`font-display`). Onest: everything else (`font-sans`).
const onest = Onest({ subsets: ['latin'], variable: '--font-onest', display: 'swap' });
const doto = Doto({
  subsets: ['latin'],
  variable: '--font-doto',
  display: 'swap',
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: { default: 'PayMind', template: '%s · PayMind' },
  description: 'Shared money, made calm. Split bills, settle up, and understand your spending.',
};

export const viewport: Viewport = { themeColor: '#F7F5F0' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${onest.variable} ${doto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
