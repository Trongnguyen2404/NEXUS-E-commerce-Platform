import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { chart } from './chartTokens';

// Props for a dashboard stat tile.
interface Props {
  label: string;
  value: string;

  changePercent?: number | null;
  comparisonLabel?: string;

  higherIsBetter?: boolean;
  hint?: string;
}

// Single headline number with its period-on-period change.
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

          <span className="text-xs font-medium" style={{ color: chart.textMuted }}>
            No {comparisonLabel} data
          </span>
        )}
      </div>
    </div>
  );
};

export default StatTile;
