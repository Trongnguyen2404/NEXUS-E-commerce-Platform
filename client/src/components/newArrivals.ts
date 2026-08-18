import type { Product } from '../types/api';

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

// At most this share of a list may carry the badge. Past that it is on so many
// tiles that it stops meaning anything.
const MAX_SHARE = 0.25;

// Picks the products in `list` that read as genuine new arrivals.
//
// This has to be decided per list, not per tile: a tile only sees its own
// timestamp, so an entire catalogue seeded in one afternoon made every single
// card claim to be new. When most of a list is recent, nobody gets the badge.
export const pickNewArrivals = (list: Product[]): Set<string> => {
  const dated = list
    .map((p) => ({ id: p.id, at: new Date(p.createdAt).getTime() }))
    .filter((p) => Number.isFinite(p.at));

  if (dated.length === 0) return new Set();

  const cutoff = Date.now() - WINDOW_DAYS * DAY;
  const fresh = dated.filter((p) => p.at >= cutoff);

  const allowed = Math.max(1, Math.floor(dated.length * MAX_SHARE));
  if (fresh.length > allowed) return new Set();

  return new Set(fresh.map((p) => p.id));
};
