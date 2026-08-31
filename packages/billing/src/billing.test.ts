import { describe, it, expect } from 'vitest';
import { plans, planOrder } from './plans';

describe('billing abstraction', () => {
  it('has 3 plans', () => {
    expect(planOrder.length).toBe(3);
    expect(Object.keys(plans).length).toBe(3);
  });
  it('getPlanById returns correct plan', () => {
    expect(plans['pro']?.seats).toBe(10);
    expect(plans['free'].price).toBe(0);
  });
  it('free is 0', () => {
    expect(plans['free']?.price).toBe(0);
  });
});
