import { useMemo, useState } from 'react';
import { chart, compactMoney, niceCeiling } from './chartTokens';
import type { RevenuePoint } from '../../types/api';

interface Props {
  data: RevenuePoint[];
}

const WIDTH = 900;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Daily revenue as a single-series area chart.
 *
 * One series, so there is no legend — the heading says what is plotted. Order
 * count is shown in the tooltip only: putting it on a second y-axis would
 * invent a correlation between two unrelated scales.
 */
const RevenueAreaChart = ({ data }: Props) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, areaPath, linePath, ticks, maxY } = useMemo(() => {
    const max = niceCeiling(Math.max(...data.map((d) => d.revenue), 0));

    const x = (i: number) =>
      PAD.left + (data.length <= 1 ? PLOT_W / 2 : (i / (data.length - 1)) * PLOT_W);
    const y = (value: number) => PAD.top + PLOT_H - (max === 0 ? 0 : (value / max) * PLOT_H);

    const pts = data.map((d, i) => ({ ...d, x: x(i), y: y(d.revenue) }));

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const baseline = PAD.top + PLOT_H;
    const area = pts.length
      ? `${line} L${pts[pts.length - 1].x},${baseline} L${pts[0].x},${baseline} Z`
      : '';

    return {
      points: pts,
      areaPath: area,
      linePath: line,
      // Four bands keeps the grid recessive; more lines start competing with data.
      ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: max * f, y: y(max * f) })),
      maxY: max,
    };
  }, [data]);

  const active = hoverIndex !== null ? points[hoverIndex] : null;
  const peak = points.reduce(
    (best, p) => (p.revenue > (best?.revenue ?? -1) ? p : best),
    null as (typeof points)[number] | null,
  );

  // Which x labels to print: first, last and a few in between, so they never collide.
  const labelStep = Math.max(1, Math.ceil(points.length / 7));

  /** Maps a pointer position to the nearest data point. */
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (svgX - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (data.length - 1));

    setHoverIndex(index >= 0 && index < data.length ? index : null);
  };

  if (maxY === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center">
        <p className="text-sm font-medium" style={{ color: chart.textMuted }}>
          No revenue recorded in this period.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`Daily revenue for the last ${data.length} days`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* Gridlines: hairline, solid, recessive */}
        {ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={tick.y}
              y2={tick.y}
              stroke={chart.gridline}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={11}
              fill={chart.textMuted}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {compactMoney(tick.value).replace('.00', '')}
            </text>
          </g>
        ))}

        {/* Area wash at ~10%, then the 2px line that actually carries the data */}
        <path d={areaPath} fill={chart.series} fillOpacity={0.1} />
        <path
          d={linePath}
          fill="none"
          stroke={chart.series}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Peak marker, direct-labelled. Labelling every point would be chaos. */}
        {peak && peak.revenue > 0 && (
          <>
            <circle cx={peak.x} cy={peak.y} r={4.5} fill={chart.series} stroke={chart.surface} strokeWidth={2} />
            <text
              x={Math.min(Math.max(peak.x, PAD.left + 28), WIDTH - PAD.right - 28)}
              y={peak.y - 12}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={chart.textSecondary}
            >
              {compactMoney(peak.revenue)}
            </text>
          </>
        )}

        {/* Crosshair */}
        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke={chart.axis}
              strokeWidth={1}
            />
            <circle cx={active.x} cy={active.y} r={4.5} fill={chart.series} stroke={chart.surface} strokeWidth={2} />
          </>
        )}

        {/* Baseline */}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={PAD.top + PLOT_H}
          y2={PAD.top + PLOT_H}
          stroke={chart.axis}
          strokeWidth={1}
        />

        {points.map((p, i) =>
          i % labelStep === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              // A centred label on the first/last point overflows the viewBox and
              // gets clipped, so anchor the edge ones to the side instead.
              x={i === 0 ? PAD.left : i === points.length - 1 ? WIDTH - PAD.right : p.x}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill={chart.textMuted}
            >
              {shortDate(p.date)}
            </text>
          ) : null,
        )}
      </svg>

      {active && (
        <div
          className="absolute pointer-events-none bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-3 text-left"
          style={{
            left: `${(active.x / WIDTH) * 100}%`,
            top: 0,
            transform: 'translate(-50%, -8px)',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: chart.textMuted }}>
            {shortDate(active.date)}
          </p>
          <p className="text-sm font-black" style={{ color: chart.textPrimary }}>
            {compactMoney(active.revenue)}
          </p>
          <p className="text-xs font-medium mt-0.5" style={{ color: chart.textSecondary }}>
            {active.orders} paid order{active.orders === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  );
};

export default RevenueAreaChart;
