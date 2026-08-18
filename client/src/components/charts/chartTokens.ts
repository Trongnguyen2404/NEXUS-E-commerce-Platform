
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

// Shortens a number for an axis label, e.g. 12400 becomes 12.4k.
export const compactNumber = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('en-US');
};

// Shortens a money value for an axis label.
export const compactMoney = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Rounds an axis maximum up to a readable value.
export const niceCeiling = (value: number): number => {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;

  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
};
