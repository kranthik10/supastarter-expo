import { describe, expect, it } from 'vitest';
import { MKT_CATALOG_SCOPE, mktKey } from './keys';
import { formatMinutes } from './status';
import { formatMinor } from './money';

describe('marketplace client helpers', () => {
  it('scopes query keys by user so users never share cache entries', () => {
    expect(mktKey('bookings', 'user-a', 'upcoming')).toEqual(['mkt', 'bookings', 'user-a', 'upcoming']);
    expect(mktKey('bookings', 'user-a')).not.toEqual(mktKey('bookings', 'user-b'));
    expect(mktKey('services', MKT_CATALOG_SCOPE)).toEqual(['mkt', 'services', 'catalog']);
  });

  it('formats integer minor units as currency without floats', () => {
    expect(formatMinor(7500, 'USD', 'en-US')).toBe('$75.00');
    expect(formatMinor(0, 'USD', 'en-US')).toBe('$0.00');
  });

  it('formats availability minutes as wall-clock times', () => {
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(1080)).toBe('18:00');
    expect(formatMinutes(0)).toBe('00:00');
  });
});
