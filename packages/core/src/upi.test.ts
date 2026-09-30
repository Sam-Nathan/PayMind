import { describe, expect, it } from 'vitest';
import {
  buildAndroidIntentUri,
  buildIosUpiUri,
  buildUpiUri,
  getUpiAppTarget,
  isValidVpa,
  parseUpiUri,
  upiAppTargets,
  UpiError,
} from './upi.ts';

describe('buildUpiUri (design page 8: Pay Karthik ₹1,240)', () => {
  const params = { pa: 'karthikr@okbank', pn: 'Karthik R', am: 124000, tn: 'PM-402-SEP Flat 402 · September', tr: 'PM402SEP0001' };

  it('builds an encoded upi://pay link with a 2-decimal rupee amount', () => {
    expect(buildUpiUri(params)).toBe(
      'upi://pay?pa=karthikr%40okbank&pn=Karthik%20R&am=1240.00&cu=INR&tn=PM-402-SEP%20Flat%20402%20%C2%B7%20September&tr=PM402SEP0001',
    );
    expect(buildUpiUri({ pa: 'a@ybl', pn: 'A', am: 5 })).toBe('upi://pay?pa=a%40ybl&pn=A&am=0.05&cu=INR');
    expect(buildUpiUri({ pa: 'a@ybl', pn: "Rahul & Priya's (trip)", am: 72081 })).toContain('pn=Rahul%20%26%20Priya%27s%20%28trip%29&am=720.81');
  });

  it('round-trips through parseUpiUri', () => {
    expect(parseUpiUri(buildUpiUri(params))).toEqual({ ...params, cu: 'INR' });
    expect(parseUpiUri('upi://pay?pa=shop@paytm&pn=Shop+Name&am=10.5&mc=5812')).toEqual({ pa: 'shop@paytm', pn: 'Shop Name', am: 1050, mc: '5812' });
    expect(parseUpiUri('https://example.com')).toBeNull();
    expect(parseUpiUri('upi://pay?pn=NoVpa')).toBeNull();
  });

  it('validates', () => {
    expect(() => buildUpiUri({ ...params, pa: 'not a vpa' })).toThrow(UpiError);
    expect(() => buildUpiUri({ ...params, am: 0 })).toThrow(/greater than zero/);
    expect(() => buildUpiUri({ ...params, am: 12.5 })).toThrow();
    expect(() => buildUpiUri({ ...params, pn: '  ' })).toThrow(/name/);
    expect(() => buildUpiUri({ ...params, tr: 'x'.repeat(36) })).toThrow(/tr/);
    expect(() => buildUpiUri({ ...params, cu: 'USD' as 'INR' })).toThrow(/INR/);
    expect(buildUpiUri({ ...params, tn: 'n'.repeat(200) })).toContain(`tn=${'n'.repeat(80)}&`);
  });

  it.each([
    ['karthikr@okbank', true],
    ['brewstreet@ybl', true],
    ['9876543210@paytm', true],
    ['first.last-1_x@okhdfcbank', true],
    ['uber.india@upi', true],
    ['@ybl', false],
    ['name@', false],
    ['name@1bank', false],
    ['name ybl', false],
    ['a@b', false],
  ])('isValidVpa(%s) = %s', (vpa, ok) => {
    expect(isValidVpa(vpa)).toBe(ok);
  });
});

describe('app targets', () => {
  it('lists PhonePe, Google Pay, Paytm and BHIM with packages and iOS schemes', () => {
    expect(upiAppTargets.map((a) => [a.name, a.androidPackage, a.iosScheme])).toEqual([
      ['PhonePe', 'com.phonepe.app', 'phonepe://pay'],
      ['Google Pay', 'com.google.android.apps.nbu.paisa.user', 'tez://upi/pay'],
      ['Paytm', 'net.one97.paytm', 'paytmmp://pay'],
      ['BHIM', 'in.org.npci.upiapp', 'bhim://pay'],
    ]);
    expect(getUpiAppTarget('gpay').name).toBe('Google Pay');
    expect(() => getUpiAppTarget('x' as 'gpay')).toThrow();
  });

  it('builds app-specific links', () => {
    const p = { pa: 'karthikr@okbank', pn: 'Karthik R', am: 124000 };
    expect(buildIosUpiUri('phonepe', p)).toBe('phonepe://pay?pa=karthikr%40okbank&pn=Karthik%20R&am=1240.00&cu=INR');
    expect(buildIosUpiUri('gpay', p).startsWith('tez://upi/pay?pa=')).toBe(true);
    expect(buildAndroidIntentUri('phonepe', p)).toBe(
      'intent://pay?pa=karthikr%40okbank&pn=Karthik%20R&am=1240.00&cu=INR#Intent;scheme=upi;package=com.phonepe.app;end',
    );
  });
});
