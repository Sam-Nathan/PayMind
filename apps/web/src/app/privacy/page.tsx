import type { Metadata } from 'next';
import { LegalPage } from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What PayMind collects, what it never collects, how AI is used, and how you can delete your data.',
};

const CONTACT = 'privacy@paymind.example'; // TODO(owner): replace with the real contact address.

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy policy" updated="30 September 2026 (draft)">
      <p>
        PayMind helps people who share expenses (friends, couples, families, flatmates, trips) split
        bills, settle up and understand their spending. This policy explains, in plain language, what
        data PayMind handles and the choices you have. PayMind is not a bank or a wallet and never
        holds or moves your money. Payments happen in your own UPI app.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <b>Account:</b> your name, email address (or phone number if you sign in that way), and
          optionally your UPI ID so friends can pay you.
        </li>
        <li>
          <b>Expenses and spaces you enter:</b> titles, amounts, dates, who paid, how it was split,
          categories, the people (names, optional UPI IDs) you add to a space, and settlements you
          record.
        </li>
        <li>
          <b>Receipt images:</b> only if you scan a bill and choose to keep receipts. If you switch
          &ldquo;Keep receipt photos&rdquo; off, we read the bill and discard the image.
        </li>
        <li>
          <b>Payment notification fields (Android, opt-in only):</b> if you turn on &ldquo;UPI &amp;
          bank alerts&rdquo;, the app&apos;s notification listener looks only at notifications from
          UPI and bank apps and extracts three things on your device: the <b>amount</b>, the{' '}
          <b>payee</b> and the <b>time</b>. This parsing happens on your phone. Only those parsed
          fields are saved, as suggestions for you to confirm or dismiss.
        </li>
        <li>
          <b>Technical data:</b> a push-notification token for your device, app version, and basic
          logs needed to keep the service secure and working.
        </li>
        <li>
          <b>Safe-to-spend balance (web):</b> if you type in a bank balance on the web app, it is
          stored only in a cookie in your browser and is not sent to our database.
        </li>
      </ul>

      <h2>2. What we do NOT collect</h2>
      <ul>
        <li>Your UPI PIN, card numbers, CVV, banking passwords or OTPs.</li>
        <li>
          The content of your SMS messages or notifications beyond the parsed amount, payee and time
          described above.
        </li>
        <li>Notifications from any app that is not a UPI or bank app, and your contacts list.</li>
        <li>Access to your bank account. PayMind never moves money on its own.</li>
      </ul>

      <h2>3. How we use your data</h2>
      <ul>
        <li>To run the app: split expenses, compute balances, suggest the fewest payments.</li>
        <li>To build UPI payment links and QR codes that open your own UPI app.</li>
        <li>To send reminders and alerts you have asked for.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
      </ul>
      <p>We do not sell your data and we do not show third-party advertising.</p>

      <h2>4. AI providers</h2>
      <p>
        When AI features are enabled, the text or image of a bill you scan, or a voice or typed
        request you make, is sent to an AI provider so it can be turned into structured expense
        details or an answer. AI only <b>proposes</b>: nothing is saved as real data until you
        confirm it. Providers process the content to return a result for you and are not permitted to
        use it to advertise to you. You can switch AI off at any time in Privacy &amp; data; the app
        then works with manual entry and plain search.
      </p>

      <h2>5. Who can see what</h2>
      <ul>
        <li>
          People in a space see only the items shared in that space (shared expenses, their splits,
          balances and settlements). They never see your personal expenses.
        </li>
        <li>Your private notes on expenses are visible only to you.</li>
        <li>
          &ldquo;How I paid&rdquo; on a settlement is visible to others only if you turn that setting
          on.
        </li>
        <li>
          Other members see the display name and UPI ID you or they entered for a member. They do not
          see your email or phone number.
        </li>
        <li>
          If you create a pay link, anyone with the link can see the payee name, UPI ID, amount and
          the listed items. Share it only with the person who owes you.
        </li>
        <li>We may disclose data if required by law.</li>
      </ul>

      <h2>6. Service providers and data location</h2>
      <p>
        Your data is stored in a Supabase (PostgreSQL) database hosted in <b>India (Mumbai region)</b>
        , with access controlled row by row so that you can reach only your own and your spaces&apos;
        data. AI requests go to the AI provider configured for the app. Push notifications are
        delivered through Expo and the platform notification services.
      </p>

      <h2>7. How long we keep data</h2>
      <ul>
        <li>Your account data and expenses are kept while your account is active.</li>
        <li>Receipt images are kept only while &ldquo;Keep receipt photos&rdquo; is on.</li>
        <li>
          Suggestions from payment notifications you mark &ldquo;Not mine&rdquo; or dismiss are
          removed on a rolling basis.
        </li>
        <li>After you delete your account, personal data is removed as described below.</li>
        <li>Short-lived security logs are kept for up to 90 days.</li>
      </ul>

      <h2>8. Deleting your data</h2>
      <p>
        You can delete your account in the app (Privacy &amp; data, &ldquo;Delete my account&rdquo;).
        This deletes your personal data: personal expenses, notes, captured-payment suggestions,
        AI proposals, learned rules, budgets, goals, devices, settings and your profile. Expenses and
        settlements that you shared with other people remain so that their balances stay correct, but
        your name on them is replaced with <b>&ldquo;Former member&rdquo;</b> and they are no longer
        linked to you. You can also email us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> to request deletion.
      </p>

      <h2>9. Your choices and rights (DPDP Act 2023)</h2>
      <p>
        Under India&apos;s Digital Personal Data Protection Act, 2023 you have the right to:
      </p>
      <ul>
        <li>know what personal data we process and why;</li>
        <li>correct or update your data (most of it can be edited in the app);</li>
        <li>erase your data (see section 8);</li>
        <li>withdraw consent at any time (every optional source has a switch in Privacy &amp; data);</li>
        <li>nominate another person to exercise your rights if you die or cannot do so;</li>
        <li>have your grievances addressed. Contact us below and we will respond within a reasonable time.</li>
      </ul>
      <p>
        If you are not satisfied, you may complain to the Data Protection Board of India once it is
        operational.
      </p>

      <h2>10. Children</h2>
      <p>PayMind is not intended for people under 18. If you believe a child has signed up, contact us and we will delete the account.</p>

      <h2>11. Changes to this policy</h2>
      <p>
        If we change this policy in a meaningful way we will tell you in the app before the change
        takes effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        Grievance and privacy contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a> (placeholder
        address, to be replaced by the owner).
      </p>
    </LegalPage>
  );
}
