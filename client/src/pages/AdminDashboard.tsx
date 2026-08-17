import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Inbox, Loader2, PackageX, Table2 } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import StatTile from '../components/charts/StatTile';
import RevenueAreaChart from '../components/charts/RevenueAreaChart';
import HorizontalBars from '../components/charts/HorizontalBars';
import { chart, compactMoney, compactNumber } from '../components/charts/chartTokens';
import type {
  DashboardOverview,
  RevenuePoint,
  StatusBreakdown,
  TopProduct,
} from '../types/api';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

const AdminDashboard = () => {
  const [days, setDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [statuses, setStatuses] = useState<StatusBreakdown[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ov, rev, top, st] = await Promise.all([
        axiosClient.get<DashboardOverview>('/admin/dashboard/overview', { params: { days } }),
        axiosClient.get<RevenuePoint[]>('/admin/dashboard/revenue', { params: { days } }),
        axiosClient.get<TopProduct[]>('/admin/dashboard/top-products', { params: { days, limit: 5 } }),
        axiosClient.get<StatusBreakdown[]>('/admin/dashboard/order-status'),
      ]);
      setOverview(ov);
      setRevenue(rev);
      setTopProducts(top);
      setStatuses(st);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && !overview) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  const periodLabel = `previous ${days} days`;

  // Alerts that need action. Only rendered when non-zero, so a healthy shop
  // shows a clean page instead of a row of green "0"s.
  const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
    `${count} ${count === 1 ? singular : pluralForm}`;

  const alerts = [
    overview?.pendingOrders
      ? { icon: AlertTriangle, label: `${plural(overview.pendingOrders, 'order')} awaiting payment`, to: '/admin/orders' }
      : null,
    overview?.outOfStockProducts
      ? { icon: PackageX, label: `${plural(overview.outOfStockProducts, 'product')} out of stock`, to: '/admin/products' }
      : null,
    overview?.lowStockProducts
      ? { icon: PackageX, label: `${plural(overview.lowStockProducts, 'product')} running low`, to: '/admin/products' }
      : null,
    overview?.unreadContacts
      ? { icon: Inbox, label: `${plural(overview.unreadContacts, 'unread message')} `.trim(), to: '/admin/contacts' }
      : null,
  ].filter(Boolean) as { icon: typeof AlertTriangle; label: string; to: string }[];

  return (
    <div className="min-h-screen bg-[#EDEDF0] py-12 px-4 sm:px-8">
      <div className="max-w-[1400px] mx-auto space-y-8">

        {/* Header + period filter, in one row above the charts */}
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 border border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Dashboard</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">
              Store performance
            </p>
          </div>

          <div className="flex gap-1 bg-[#F5F5F7] p-1.5 rounded-2xl">
            {PERIODS.map((period) => (
              <button
                key={period.days}
                type="button"
                onClick={() => setDays(period.days)}
                aria-pressed={days === period.days}
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
                  days === period.days ? 'bg-black text-white' : 'text-gray-500 hover:text-black'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hero figure — the one number the page leads with */}
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 border border-gray-300">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: chart.textMuted }}>
            Lifetime revenue
          </p>
          <p className="text-5xl sm:text-6xl font-black tracking-tighter leading-none" style={{ color: chart.textPrimary }}>
            {compactMoney(overview?.lifetimeRevenue ?? 0)}
          </p>
          <p className="text-xs font-medium mt-3" style={{ color: chart.textSecondary }}>
            Captured payments, all time
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatTile
            label={`Revenue · last ${days}d`}
            value={compactMoney(overview?.revenue.current ?? 0)}
            changePercent={overview?.revenue.changePercent}
            comparisonLabel={periodLabel}
          />
          <StatTile
            label={`Orders · last ${days}d`}
            value={compactNumber(overview?.orders.current ?? 0)}
            changePercent={overview?.orders.changePercent}
            comparisonLabel={periodLabel}
          />
          <StatTile
            label={`New customers · last ${days}d`}
            value={compactNumber(overview?.customers.current ?? 0)}
            changePercent={overview?.customers.changePercent}
            comparisonLabel={periodLabel}
          />
          <StatTile
            label="Average order value"
            value={compactMoney(overview?.averageOrderValue ?? 0)}
            hint="Across paid orders in this period"
          />
        </div>

        {alerts.length > 0 && (
          <div className="bg-white rounded-[2rem] p-8 border border-gray-300">
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: chart.textMuted }}>
              Needs attention
            </h2>
            <ul className="flex flex-wrap gap-3">
              {alerts.map((alert) => (
                <li key={alert.label}>
                  <Link
                    to={alert.to}
                    className="inline-flex items-center gap-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-xl px-4 py-3 text-sm font-bold transition-colors"
                    style={{ color: chart.textPrimary }}
                  >
                    <alert.icon size={16} style={{ color: chart.deltaDown }} />
                    {alert.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Revenue over time */}
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 border border-gray-300">
          <div className="flex items-start justify-between gap-6 mb-8">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight" style={{ color: chart.textPrimary }}>
                Revenue per day
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: chart.textSecondary }}>
                Captured payments, last {days} days (UTC)
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowTable((open) => !open)}
              aria-expanded={showTable}
              className="inline-flex items-center gap-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors shrink-0"
            >
              <Table2 size={14} />
              {showTable ? 'Hide table' : 'Table view'}
            </button>
          </div>

          <RevenueAreaChart data={revenue} />

          {/* Table view — the same numbers, for screen readers and anyone who
              would rather read than hover. */}
          {showTable && (
            <div className="mt-8 max-h-72 overflow-y-auto rounded-2xl border border-gray-200">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-[#F5F5F7]">
                  <tr>
                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest">Date</th>
                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-right">Revenue</th>
                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {revenue.map((point) => (
                    <tr key={point.date}>
                      <td className="py-2.5 px-4 text-sm font-medium">{point.date}</td>
                      <td className="py-2.5 px-4 text-sm font-bold text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {compactMoney(point.revenue)}
                      </td>
                      <td className="py-2.5 px-4 text-sm text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {point.orders}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-[2rem] p-8 sm:p-10 border border-gray-300">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2" style={{ color: chart.textPrimary }}>
              Best sellers
            </h2>
            <p className="text-xs font-medium mb-8" style={{ color: chart.textSecondary }}>
              By revenue, last {days} days
            </p>

            <HorizontalBars
              emptyMessage="No sales in this period."
              rows={topProducts.map((product) => ({
                key: product.productId,
                label: product.name,
                value: product.revenue,
                displayValue: compactMoney(product.revenue),
                caption: `${product.unitsSold} unit${product.unitsSold === 1 ? '' : 's'} sold`,
              }))}
            />
          </div>

          <div className="bg-white rounded-[2rem] p-8 sm:p-10 border border-gray-300">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2" style={{ color: chart.textPrimary }}>
              Orders by status
            </h2>
            <p className="text-xs font-medium mb-8" style={{ color: chart.textSecondary }}>
              All orders, current state
            </p>

            <HorizontalBars
              emptyMessage="No orders yet."
              rows={statuses.map((row) => ({
                key: row.status,
                label: row.status.charAt(0) + row.status.slice(1).toLowerCase(),
                value: row.count,
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
