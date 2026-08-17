/**
 * Chart palette, kept in one place so every chart is written against roles
 * rather than raw hex.
 *
 * Single hue throughout: each chart here plots ONE series, so identity never
 * rides on color — the axis labels carry it. Colouring bars darker-where-bigger
 * would double-encode length as hue and buy nothing.
 *
 * `series` is the validated blue slot-1 step; it clears 3:1 against the white
 * card surface. `seriesWash`/`seriesSoft` are below 3:1 and are therefore only
 * ever used as area fill or an inactive track, never as a mark that carries a
 * value on its own.
 */
export const chart = {
  surface: '#ffffff',
  series: '#2a78d6',
  seriesSoft: '#86b6ef',
  seriesWash: '#cde2fb',

  gridline: '#e1e0d9',
  axis: '#c3c2b7',

  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',

  deltaUp: '#006300',
  deltaDown: '#d03b3b',
} as const;

/** 1,284 → "1,284"; 12,900 → "12.9K"; 4,200,000 → "4.2M". */
export const compactNumber = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('en-US');
};

export const compactMoney = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Rounds an axis maximum up to a clean 1/2/5 × 10ⁿ step so ticks read
 * 0 / 500 / 1,000 rather than 0 / 437 / 874.
 */
export const niceCeiling = (value: number): number => {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;

  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
};
