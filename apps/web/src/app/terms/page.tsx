import type { Metadata } from 'next';
import { LegalPage } from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms for using PayMind.',
};

const CONTACT = 'support@paymind.example'; // TODO(owner): replace with the real contact address.

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="30 September 2026 (draft)">
      <p>
        These terms govern your use of PayMind (the app and website). By creating an account or using
        PayMind you agree to them. If you do not agree, please do not use PayMind.
      </p>

      <h2>1. What PayMind is, and is not</h2>
      <p>
        PayMind is a tool to record shared expenses, work out who owes whom and help you settle up.
        PayMind is <b>not a bank, a wallet or a payment service</b>. It never holds, receives or moves
        your money. When you choose to pay, PayMind opens your own UPI app with the payee, amount and
        note filled in, and you approve the payment there. PayMind only records the state of a
        settlement (for example initiated or confirmed).
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 and give accurate information.</li>
        <li>Keep your sign-in details safe. You are responsible for activity under your account.</li>
        <li>You can delete your account at any time from the app.</li>
      </ul>

      <h2>3. Your content and other people</h2>
      <ul>
        <li>
          You are responsible for the expenses and names you enter. Do not add another person&apos;s
          UPI ID without their knowledge or use PayMind to harass anyone.
        </li>
        <li>
          Things you share in a space are visible to that space&apos;s members, as described in the
          Privacy policy.
        </li>
        <li>
          AI suggestions can be wrong. Always check amounts and splits before confirming. You are
          responsible for what you confirm.
        </li>
      </ul>

      <h2>4. Payments between people</h2>
      <p>
        Payments are made between you and the other person through your UPI apps and banks, under
        their terms. PayMind does not guarantee that a payment succeeds, arrives, or that a person
        will pay what they owe, and is not a party to any dispute between members. Balances shown are
        calculated from what members have recorded.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>No illegal activity, fraud, or attempts to break or overload the service.</li>
        <li>No reverse engineering or scraping except as the law allows.</li>
        <li>No use of PayMind to collect money you are not owed.</li>
      </ul>

      <h2>6. Availability and changes</h2>
      <p>
        We work to keep PayMind available but it is provided &ldquo;as is&rdquo;. Features may change
        or be withdrawn. We may suspend accounts that break these terms.
      </p>

      <h2>7. Liability</h2>
      <p>
        To the extent permitted by law, PayMind is not liable for indirect or consequential losses,
        or for losses caused by incorrect entries, unsuccessful payments, or third-party services
        (UPI apps, banks, AI providers). Nothing here limits liability that cannot be limited by law.
      </p>

      <h2>8. Governing law</h2>
      <p>
        These terms are governed by the laws of India. Courts at the location to be specified by the
        owner will have jurisdiction. (Placeholder, to be completed.)
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a> (placeholder address).
      </p>
    </LegalPage>
  );
}
