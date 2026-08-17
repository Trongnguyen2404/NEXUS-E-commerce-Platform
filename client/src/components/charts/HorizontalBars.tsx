import { chart } from './chartTokens';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Printed at the bar tip. Falls back to the raw value. */
  displayValue?: string;
  caption?: string;
}

interface Props {
  rows: BarRow[];
  emptyMessage?: string;
}

/**
 * Magnitude comparison across named rows.
 *
 * Every bar is the same colour on purpose: there is one series, so length
 * already encodes the value. Shading bars darker-where-bigger would spend the
 * colour channel restating what the reader can already see.
 */
const HorizontalBars = ({ rows, emptyMessage = 'Nothing to show yet.' }: Props) => {
  const max = Math.max(...rows.map((row) => row.value), 0);

  if (rows.length === 0 || max === 0) {
    return (
      <p className="text-sm font-medium py-10 text-center" style={{ color: chart.textMuted }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-5">
      {rows.map((row) => {
        const percent = (row.value / max) * 100;

        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <span className="text-sm font-bold truncate" style={{ color: chart.textPrimary }}>
                {row.label}
              </span>
              <span
                className="text-sm font-black shrink-0"
                style={{ color: chart.textPrimary, fontVariantNumeric: 'tabular-nums' }}
              >
                {row.displayValue ?? row.value.toLocaleString('en-US')}
              </span>
            </div>

            {/* Track is a lighter step of the same ramp, so state reads across
                the whole bar rather than stopping at the fill. */}
            <div
              className="h-3 rounded-full overflow-hidden"
              style={{ backgroundColor: chart.seriesWash }}
              role="img"
              aria-label={`${row.label}: ${row.displayValue ?? row.value}`}
            >
              <div
                className="h-full"
                style={{
                  width: `${percent}%`,
                  backgroundColor: chart.series,
                  // Square where it meets the baseline, rounded at the data end.
                  borderRadius: '0 4px 4px 0',
                }}
              />
            </div>

            {row.caption && (
              <p className="text-[11px] font-medium mt-1.5" style={{ color: chart.textMuted }}>
                {row.caption}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default HorizontalBars;
