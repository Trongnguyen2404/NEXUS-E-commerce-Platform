import { OrderStatus } from '@prisma/client';
import { DashboardService } from '@/modules/dashboard/dashboard.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { money } from '@/common/testing/factories';

// The three payment aggregates the overview runs, in the order it runs them:
// current period, previous period, then all time.
type Sums = { amount: number; refunded: number; count?: number };

describe('DashboardService', () => {
  let prisma: PrismaMock;
  let dashboard: DashboardService;

  beforeEach(() => {
    prisma = createPrismaMock();
    dashboard = new DashboardService(prisma as unknown as PrismaService);

    prisma.order.count.mockResolvedValue(0 as never);
    prisma.user.count.mockResolvedValue(0 as never);
    prisma.product.count.mockResolvedValue(0 as never);
    prisma.contact.count.mockResolvedValue(0 as never);
    prisma.order.groupBy.mockResolvedValue([] as never);
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  const givenPayments = (current: Sums, previous: Sums, lifetime: Sums) => {
    const row = ({ amount, refunded, count = 0 }: Sums) => ({
      _sum: { amount: money(amount), refundedAmount: money(refunded) },
      _count: count,
    });

    (prisma.payment.aggregate as unknown as jest.Mock)
      .mockResolvedValueOnce(row(current))
      .mockResolvedValueOnce(row(previous))
      .mockResolvedValueOnce(row(lifetime));
  };

  describe('getOverview', () => {
    it('reports revenue net of a partial refund rather than the full charge', async () => {
      // $500 captured, $450 handed back: the payment stays COMPLETED because a
      // partial refund cannot be expressed by the status alone.
      givenPayments(
        { amount: 500, refunded: 450, count: 1 },
        { amount: 0, refunded: 0 },
        { amount: 500, refunded: 450 },
      );

      const overview = await dashboard.getOverview(30);

      expect(overview.revenue.current).toBe(50);
      expect(overview.lifetimeRevenue).toBe(50);
    });

    it('measures the previous period net of its refunds too', async () => {
      givenPayments(
        { amount: 100, refunded: 0, count: 1 },
        { amount: 200, refunded: 150 },
        { amount: 300, refunded: 150 },
      );

      const overview = await dashboard.getOverview(30);

      expect(overview.revenue.previous).toBe(50);
      expect(overview.revenue.changePercent).toBe(100);
    });

    it('divides the average order value by the money actually kept', async () => {
      givenPayments(
        { amount: 500, refunded: 450, count: 2 },
        { amount: 0, refunded: 0 },
        { amount: 500, refunded: 450 },
      );

      const overview = await dashboard.getOverview(30);

      expect(overview.averageOrderValue).toBe(25);
    });

    it('asks the database for the refunded column alongside the charged one', async () => {
      givenPayments(
        { amount: 0, refunded: 0, count: 0 },
        { amount: 0, refunded: 0 },
        { amount: 0, refunded: 0 },
      );

      await dashboard.getOverview(30);

      for (const call of (prisma.payment.aggregate as unknown as jest.Mock).mock
        .calls) {
        expect((call[0] as { _sum: unknown })._sum).toEqual(
          expect.objectContaining({ amount: true, refundedAmount: true }),
        );
      }
    });

    it('keeps the netting exact for amounts float arithmetic would spoil', async () => {
      givenPayments(
        { amount: 0.3, refunded: 0.1, count: 1 },
        { amount: 0, refunded: 0 },
        { amount: 0.3, refunded: 0.1 },
      );

      const overview = await dashboard.getOverview(30);

      expect(overview.revenue.current).toBe(0.2);
    });

    it('reports zero revenue when no payment landed in the period', async () => {
      (prisma.payment.aggregate as unknown as jest.Mock).mockResolvedValue({
        _sum: { amount: null, refundedAmount: null },
        _count: 0,
      });

      const overview = await dashboard.getOverview(30);

      expect(overview.revenue.current).toBe(0);
      expect(overview.averageOrderValue).toBe(0);
      expect(overview.lifetimeRevenue).toBe(0);
    });
  });

  describe('getRevenueSeries', () => {
    it('sums each day net of refunds instead of the gross charge', async () => {
      await dashboard.getRevenueSeries(7);

      const [strings] = (prisma.$queryRaw as unknown as jest.Mock).mock
        .calls[0] as [string[]];
      const sql = strings.join(' ');

      expect(sql).toContain('"amount" - "refundedAmount"');
      expect(sql).not.toMatch(/SUM\(\s*"amount"\s*\)/);
    });

    it('returns one point per requested day, zero-filling the quiet ones', async () => {
      const series = await dashboard.getRevenueSeries(7);

      expect(series).toHaveLength(7);
      expect(series.every((point) => point.revenue === 0)).toBe(true);
    });
  });

  describe('getStatusBreakdown', () => {
    it('lists every status, including the ones with no orders', async () => {
      const breakdown = await dashboard.getStatusBreakdown();

      expect(breakdown).toHaveLength(Object.values(OrderStatus).length);
      expect(breakdown.every((row) => row.count === 0)).toBe(true);
    });
  });
});
