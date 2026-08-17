import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { chart } from './chartTokens';

interface Props {
  label: string;
  value: string;
  /** Percent change vs the previous period; null when that period was zero. */
  changePercent?: number | null;
  comparisonLabel?: string;
  /** Set false where a rise is bad (e.g. out-of-stock count). */
  higherIsBetter?: boolean;
  hint?: string;
}

/**
 * One headline number. Deliberately not a one-bar chart — a single current
 * value with a trend is a stat tile.
 */
const StatTile = ({
  label,
  value,
  changePercent,
  comparisonLabel = 'previous period',
  higherIsBetter = true,
  hint,
}: Props) => {
  const hasDelta = changePercent !== undefined && changePercent !== null;
  const isFlat = hasDelta && changePercent === 0;
  const isUp = hasDelta && changePercent! > 0;

  // Direction alone does not decide the colour — "up" is only good when the
  // metric is one where up is good.
  const isGood = isUp === higherIsBetter;
  const deltaColor = isFlat
    ? chart.textMuted
    : isGood
      ? chart.deltaUp
      : chart.deltaDown;

  const DeltaIcon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6">
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-3"
        style={{ color: chart.textMuted }}
      >
        {label}
      </p>

      <p
        className="text-3xl font-black tracking-tighter leading-none"
        style={{ color: chart.textPrimary }}
      >
        {value}
      </p>

      <div className="mt-3 min-h-[18px]">
        {hasDelta ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: deltaColor }}>
            <DeltaIcon size={14} strokeWidth={2.5} />
            {Math.abs(changePercent!).toFixed(1)}%
            <span className="font-medium" style={{ color: chart.textMuted }}>
              vs {comparisonLabel}
            </span>
          </span>
        ) : hint ? (
          <span className="text-xs font-medium" style={{ color: chart.textMuted }}>
            {hint}
          </span>
        ) : (
          // No prior data to compare against — say so rather than showing a
          // meaningless "+100%".
          <span className="text-xs font-medium" style={{ color: chart.textMuted }}>
            No {comparisonLabel} data
          </span>
        )}
      </div>
    </div>
  );
};

export default StatTile;
