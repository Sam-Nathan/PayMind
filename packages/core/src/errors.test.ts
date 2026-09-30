import { describe, expect, it } from 'vitest';
import { errorCodeOf, friendlyError, GENERIC_ERROR } from './errors.ts';

describe('errorCodeOf', () => {
  it('extracts the snake_case code prefix', () => {
    expect(errorCodeOf({ message: 'shares_sum_mismatch: 100 vs 99' })).toBe('shares_sum_mismatch');
    expect(errorCodeOf('payer_not_in_space: x')).toBe('payer_not_in_space');
    expect(errorCodeOf({ message: 'Network request failed' })).toBeNull();
  });
});

describe('friendlyError', () => {
  it('maps known codes, with or without detail', () => {
    expect(friendlyError({ message: 'payer_not_in_space: x', code: '22023' })).toMatch(/isn't in this space/);
    expect(friendlyError({ message: 'not_authenticated', code: '42501' })).toMatch(/sign in/);
  });
  it('falls back on transport errors, SQLSTATE and a generic message', () => {
    expect(friendlyError(new Error('Failed to fetch'))).toMatch(/connection/);
    expect(friendlyError({ message: 'weird', code: '23514' })).toMatch(/add up/);
    expect(friendlyError(null)).toBe(GENERIC_ERROR);
  });
});
