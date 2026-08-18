import { describe, expect, it } from 'vitest';
import { pickNewArrivals } from './newArrivals';
import type { Product } from '../types/api';

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const p = (id: string, days: number) => ({ id, createdAt: daysAgo(days) }) as Product;
const many = (n: number, days: number, prefix = 'p') =>
  Array.from({ length: n }, (_, i) => p(`${prefix}${i}`, days));

describe('pickNewArrivals', () => {
  it('badges nothing when the whole catalogue landed in one batch', () => {
    expect([...pickNewArrivals(many(29, 0))]).toEqual([]);
  });

  it('badges the one product that is genuinely newer than the rest', () => {
    expect([...pickNewArrivals([...many(28, 60, 'old'), p('FRESH', 1)])]).toEqual(['FRESH']);
  });

  it('badges nothing when everything predates the window', () => {
    expect([...pickNewArrivals(many(8, 40))]).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(pickNewArrivals([]).size).toBe(0);
  });

  it('badges a single recent product', () => {
    expect([...pickNewArrivals([p('solo', 1)])]).toEqual(['solo']);
  });

  it('badges one of four related products but not four of four', () => {
    expect([...pickNewArrivals([p('o1', 90), p('o2', 90), p('o3', 90), p('N', 1)])]).toEqual(['N']);
    expect([...pickNewArrivals(many(4, 0, 'r'))]).toEqual([]);
  });

  it('ignores products whose createdAt is unparseable', () => {
    const list = [...many(20, 60, 'old'), { id: 'bad', createdAt: 'not-a-date' } as Product];
    expect([...pickNewArrivals(list)]).toEqual([]);
  });
});
