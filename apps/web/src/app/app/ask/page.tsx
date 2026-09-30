import type { Metadata } from 'next';
import { Container, EmptyState, PageTitle } from '../../../components/ui';

export const metadata: Metadata = { title: 'Ask' };

const IDEAS = [
  'Who still owes me from the Goa trip?',
  'How much did I spend on food this month?',
  'Can I afford a ₹15,000 phone?',
];

export default function AskPage() {
  return (
    <Container className="pt-6 md:pt-10">
      <PageTitle title="Ask PayMind" sub="Questions about your money, answered from your own data" />
      <div className="mt-6">
        <EmptyState title="Coming soon on the web">
          Ask PayMind is available in the mobile app first. Here is the kind of thing you will be
          able to ask:
        </EmptyState>
        <ul className="mt-4 flex flex-wrap gap-2">
          {IDEAS.map((q) => (
            <li
              key={q}
              className="rounded-full border border-hairline bg-white px-4 py-2.5 text-[15px] font-semibold text-text-muted"
            >
              {q}
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
