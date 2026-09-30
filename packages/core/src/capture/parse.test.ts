import { describe, expect, it } from 'vitest';
import { dedupeHash, dedupeKey, isLikelyDuplicate, parsePaymentText, type ParsedTxn } from './parse.ts';

type Case = [string, Partial<ParsedTxn> & Pick<ParsedTxn, 'direction' | 'amountMinor'>];

const cases: Case[] = [
  // --- from the task / design page 4
  ['₹240 paid to Brew Street Café', { direction: 'debit', amountMinor: 24000, payee: 'Brew Street Café' }],
  [
    'Rs.500.00 debited from A/c XX1234 on 13-10-26 to VPA brewstreet@ybl UPI Ref 123456789012',
    { direction: 'debit', amountMinor: 50000, vpa: 'brewstreet@ybl', account_last4: '1234', ref: '123456789012', occurredAt: '2026-10-13' },
  ],
  ['You paid ₹1,240 to Karthik R', { direction: 'debit', amountMinor: 124000, payee: 'Karthik R' }],
  [
    'INR 1,499.00 spent on HDFC Bank Card XX9876 at FITHUB GYM on 2026-09-29',
    { direction: 'debit', amountMinor: 149900, payee: 'FITHUB GYM', bank: 'HDFC Bank', account_last4: '9876', occurredAt: '2026-09-29' },
  ],
  ['Received ₹450 from Rahul', { direction: 'credit', amountMinor: 45000, payee: 'Rahul' }],

  // --- Google Pay notifications
  ['Rahul Sharma paid you ₹450', { direction: 'credit', amountMinor: 45000, payee: 'Rahul Sharma' }],
  ['Google Pay: You paid ₹212.00 to Uber India', { direction: 'debit', amountMinor: 21200, payee: 'Uber India', app: 'gpay' }],
  ['Priya sent you ₹572', { direction: 'credit', amountMinor: 57200, payee: 'Priya' }],

  // --- PhonePe
  ['Paid ₹240 to Brew Street Café', { direction: 'debit', amountMinor: 24000, payee: 'Brew Street Café' }],
  ['₹450 received from Rahul Sharma', { direction: 'credit', amountMinor: 45000, payee: 'Rahul Sharma' }],
  ['Payment of ₹240 to BREWSTREET successful. PhonePe', { direction: 'debit', amountMinor: 24000, payee: 'BREWSTREET', app: 'phonepe' }],
  ['Sent ₹1,240 to karthikr@okbank', { direction: 'debit', amountMinor: 124000, vpa: 'karthikr@okbank' }],

  // --- Paytm
  [
    'Paid Rs.240 to Brew Street Cafe from Paytm Balance. Ref: 123456789012',
    { direction: 'debit', amountMinor: 24000, payee: 'Brew Street Cafe', ref: '123456789012', app: 'paytm' },
  ],
  ['Rs.450 received from Rahul in your Paytm Wallet', { direction: 'credit', amountMinor: 45000, payee: 'Rahul', app: 'paytm' }],

  // --- Bank SMS
  [
    'Money Sent! Rs.500.00 from HDFC Bank A/c XX1234 to VPA metro.recharge@okaxis on 13-10-26 Ref 612345678901 Not You? Call 18002586161',
    { direction: 'debit', amountMinor: 50000, vpa: 'metro.recharge@okaxis', bank: 'HDFC Bank', account_last4: '1234', ref: '612345678901', occurredAt: '2026-10-13' },
  ],
  [
    'Dear UPI user A/C X1234 debited by 500.0 on date 13Oct26 trf to BREW STREET Refno 123456789012. If not u? call 1800111109. -SBI',
    { direction: 'debit', amountMinor: 50000, payee: 'BREW STREET', bank: 'State Bank of India', account_last4: '1234', ref: '123456789012', occurredAt: '2026-10-13' },
  ],
  [
    'ICICI Bank Acct XX123 debited for Rs 240.00 on 13-Oct-26; BREWSTREET credited. UPI:123456789012. Call 18002662 for dispute.',
    { direction: 'debit', amountMinor: 24000, payee: 'BREWSTREET', bank: 'ICICI Bank', account_last4: '123', ref: '123456789012', occurredAt: '2026-10-13' },
  ],
  [
    'Dear Customer, Acct XX123 is credited with Rs 450.00 on 12-Oct-26 from rahul@okaxis. UPI:298765432109-ICICI Bank.',
    { direction: 'credit', amountMinor: 45000, vpa: 'rahul@okaxis', bank: 'ICICI Bank', account_last4: '123', ref: '298765432109', occurredAt: '2026-10-12' },
  ],
  [
    'Rs.450.00 credited to a/c XX1234 on 12-10-26 by a/c linked to VPA rahul@okaxis (UPI Ref No 298765432109).',
    { direction: 'credit', amountMinor: 45000, vpa: 'rahul@okaxis', account_last4: '1234', ref: '298765432109', occurredAt: '2026-10-12' },
  ],
  [
    'Received Rs.450 in your Kotak Bank AC X1234 from rahul@okaxis on 12-10-26.UPI Ref:298765432109.',
    { direction: 'credit', amountMinor: 45000, vpa: 'rahul@okaxis', bank: 'Kotak Mahindra Bank', account_last4: '1234', ref: '298765432109', occurredAt: '2026-10-12' },
  ],
  [
    'Sent Rs.1240.00 from Kotak Bank AC X1234 to karthikr@okbank on 14-10-26.UPI Ref 612345678902. Not you, https://kotak.com/KBANKT/Fraud',
    { direction: 'debit', amountMinor: 124000, vpa: 'karthikr@okbank', bank: 'Kotak Mahindra Bank', account_last4: '1234', ref: '612345678902', occurredAt: '2026-10-14' },
  ],
  [
    'INR 240.00 debited A/c no. XX1234 13-10-26 09:12:11 UPI/P2M/612345678903/BREW STREET CAFE Not you? SMS BLOCKUPI Cust ID to 919951860002 Axis Bank',
    { direction: 'debit', amountMinor: 24000, payee: 'BREW STREET CAFE', bank: 'Axis Bank', account_last4: '1234', ref: '612345678903', occurredAt: '2026-10-13' },
  ],
  [
    'Your A/c XX5678 is debited with INR 4,200.00 on 22/10/2026 towards Bike EMI. Avl Bal: INR 48,180.00',
    { direction: 'debit', amountMinor: 420000, account_last4: '5678', occurredAt: '2026-10-22' },
  ],
  [
    'Rs 8,450.00 spent on your SBI Credit Card ending 4321 at AMAZON on 18/10/26. Avl Lmt: Rs 1,20,000.00',
    { direction: 'debit', amountMinor: 845000, payee: 'AMAZON', bank: 'State Bank of India', account_last4: '4321', occurredAt: '2026-10-18' },
  ],
  [
    'Refund of Rs 499.00 credited to your HDFC Bank A/c XX1234 from Flix+ on 03-11-26',
    { direction: 'credit', amountMinor: 49900, payee: 'Flix+', bank: 'HDFC Bank', account_last4: '1234', occurredAt: '2026-11-03' },
  ],
  ['Rs. 2,000 withdrawn at ATM from A/c XX1234 on 01-10-26', { direction: 'debit', amountMinor: 200000, account_last4: '1234', occurredAt: '2026-10-01' }],
  ['₹ 1,20,000.50 credited to your account XX1234 on 01-11-2026 - Salary', { direction: 'credit', amountMinor: 12000050, account_last4: '1234', occurredAt: '2026-11-01' }],
  [
    'Dear SBI UPI User, ur A/cX1234 credited by Rs450 on 12Oct26 by (Ref no 298765432109)',
    { direction: 'credit', amountMinor: 45000, bank: 'State Bank of India', account_last4: '1234', ref: '298765432109', occurredAt: '2026-10-12' },
  ],
  ['You have received Rs.300.00 from Neel via UPI. Ref 123456789012', { direction: 'credit', amountMinor: 30000, payee: 'Neel', ref: '123456789012' }],
  ['Your UPI transaction of Rs 150 to Neel Kumar is successful', { direction: 'debit', amountMinor: 15000, payee: 'Neel Kumar' }],
  [
    'Rs 350 debited from your account for Internet bill payment to ACT Fibernet on 25/10/2026',
    { direction: 'debit', amountMinor: 35000, payee: 'ACT Fibernet', occurredAt: '2026-10-25' },
  ],
  ['Paid ₹119 to Beat Music using Google Pay', { direction: 'debit', amountMinor: 11900, payee: 'Beat Music', app: 'gpay' }],
  [
    'Rs 240.00 sent to swiggy@icici from PNB A/c **1234 on 14-10-2026',
    { direction: 'debit', amountMinor: 24000, vpa: 'swiggy@icici', bank: 'Punjab National Bank', account_last4: '1234', occurredAt: '2026-10-14' },
  ],
  ['BHIM: ₹60 paid to Chai Point', { direction: 'debit', amountMinor: 6000, payee: 'Chai Point', app: 'bhim' }],
];

describe('parsePaymentText — payments', () => {
  it.each(cases)('%s', (text, expected) => {
    const got = parsePaymentText(text);
    expect(got).not.toBeNull();
    expect(got).toMatchObject(expected);
  });

  it('only returns the fields listed in expectations when known (no payee for bare VPA)', () => {
    expect(parsePaymentText('Sent ₹1,240 to karthikr@okbank')?.payee).toBeUndefined();
  });

  it('uses receivedAt when the text has no date, and for year inference', () => {
    expect(parsePaymentText('₹240 paid to Brew Street Café', { receivedAt: '2026-10-14T09:12:00+05:30' })?.occurredAt).toBe('2026-10-14T09:12:00+05:30');
    expect(parsePaymentText('Rs 1,499 debited from A/c XX1234 on 29 Sep for FITHUB', { receivedAt: '2026-09-29T10:00:00+05:30' })?.occurredAt).toBe('2026-09-29');
    expect(parsePaymentText('Rs 1,499 debited from A/c XX1234 on 29 Dec', { receivedAt: '2027-01-02T10:00:00+05:30' })?.occurredAt).toBe('2026-12-29');
  });

  it('takes bank and app hints from options', () => {
    const got = parsePaymentText('Rs 240 debited from A/c XX1234', { sender: 'VM-HDFCBK', app: 'phonepe' });
    expect(got?.bank).toBe('HDFC Bank');
    expect(got?.app).toBe('phonepe');
  });

  it('ignores balance amounts that appear before the transaction amount', () => {
    expect(parsePaymentText('Avl Bal Rs 10,000.00. Rs 240.00 debited from A/c XX1234')?.amountMinor).toBe(24000);
  });
});

describe('parsePaymentText — ignored messages', () => {
  it.each([
    '123456 is your OTP for txn of Rs 240.00 at BREW STREET. Do not share it with anyone.',
    'Your one time password for UPI registration is 987654',
    'Get flat ₹100 cashback on your first bill payment with PhonePe. T&C apply',
    'Congratulations! You are pre-approved for a personal loan up to Rs 5,00,000. Apply now',
    'Win up to ₹500 on every UPI payment this Diwali!',
    'Rahul has requested ₹450 from you on Google Pay',
    'Your payment of ₹240 to Brew Street Café failed. Any amount debited will be refunded.',
    'Transaction of Rs 500 declined on your HDFC Bank Card XX9876',
    'Your credit card bill of Rs 8,450 is due on 18-10-26',
    'Rs 649 will be debited on 27-10-26 for Flix+ Premium autopay',
    'Your A/c XX1234 balance is Rs 52,380.00 as on 14-10-26',
    'Hello! How are you?',
    '',
  ])('%s -> null', (text) => {
    expect(parsePaymentText(text)).toBeNull();
  });
});

describe('dedupe', () => {
  const sms = parsePaymentText('Rs.500.00 debited from A/c XX1234 on 13-10-26 to VPA brewstreet@ybl UPI Ref 123456789012') as ParsedTxn;

  it('hash is deterministic, 16 hex chars, and ref-based when a ref exists', () => {
    const again = parsePaymentText('Rs.500.00 debited from A/c XX1234 on 13-10-26 to VPA brewstreet@ybl UPI Ref 123456789012') as ParsedTxn;
    expect(dedupeHash(sms)).toMatch(/^[0-9a-f]{16}$/);
    expect(dedupeHash(sms)).toBe(dedupeHash(again));
    expect(dedupeKey(sms)).toBe('ref|debit|50000|123456789012');
    // same ref from another channel with different formatting -> same hash
    expect(dedupeHash({ direction: 'debit', amountMinor: 50000, ref: '123456789012', payee: 'Brew Street' })).toBe(dedupeHash(sms));
    expect(dedupeHash({ ...sms, amountMinor: 50001 })).not.toBe(dedupeHash(sms));
  });

  it('falls back to date + counterparty without a ref', () => {
    const a = parsePaymentText('₹240 paid to Brew Street Café', { receivedAt: '2026-10-14T09:12:00+05:30' }) as ParsedTxn;
    const b = parsePaymentText('₹240 paid to Brew Street Café', { receivedAt: '2026-10-14T09:13:30+05:30' }) as ParsedTxn;
    const c = parsePaymentText('₹240 paid to Brew Street Café', { receivedAt: '2026-10-15T09:12:00+05:30' }) as ParsedTxn;
    expect(dedupeHash(a)).toBe(dedupeHash(b));
    expect(dedupeHash(a)).not.toBe(dedupeHash(c));
  });

  it('isLikelyDuplicate matches a notification with the bank SMS', () => {
    const notif = parsePaymentText('Paid ₹500 to Brew Street', { receivedAt: '2026-10-13T09:12:00+05:30' }) as ParsedTxn;
    expect(isLikelyDuplicate(notif, sms)).toBe(true);
    expect(isLikelyDuplicate({ ...notif, amountMinor: 50100 }, sms)).toBe(false);
    expect(isLikelyDuplicate({ ...sms, ref: '999999999999' }, sms)).toBe(false);
    expect(isLikelyDuplicate({ ...notif, occurredAt: '2026-10-12' }, sms)).toBe(false);
    expect(isLikelyDuplicate({ ...notif, direction: 'credit' }, sms)).toBe(false);
  });
});
