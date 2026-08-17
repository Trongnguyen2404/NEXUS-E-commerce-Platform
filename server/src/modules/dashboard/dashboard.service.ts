import { Injectable } from '@nestjs/common';
import {
  ContactStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  DashboardOverviewDto,
  MetricDto,
  RevenuePointDto,
  StatusBreakdownDto,
  TopProductDto,
} from '@/modules/dashboard/dto/dashboard-response.dto';

/** Stock at or below this counts as "running low" on the dashboard. */
const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Headline numbers, each compared with the equally long window immediately
   * before it — a revenue figure without a trend is not decision-useful.
   */
  async getOverview(days: number): Promise<DashboardOverviewDto> {
    const now = Date.now();
    const periodMs = days * 24 * 60 * 60 * 1000;
    const currentFrom = new Date(now - periodMs);
    const previousFrom = new Date(now - periodMs * 2);

    const paidInRange = (from: Date, to?: Date): Prisma.PaymentWhereInput => ({
      status: PaymentStatus.COMPLETED,
      createdAt: { gte: from, ...(to ? { lt: to } : {}) },
    });

    const [
      revenueCurrent,
      revenuePrevious,
      lifetime,
      ordersCurrent,
      ordersPrevious,
      customersCurrent,
      customersPrevious,
      pendingOrders,
      lowStockProducts,
      outOfStockProducts,
      unreadContacts,
    ] = await Promise.all([
      // Revenue is read from payments, not orders: it is the money actually
      // captured, so an unpaid or cancelled order never inflates it.
      this.prisma.payment.aggregate({
        where: paidInRange(currentFrom),
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: paidInRange(previousFrom, currentFrom),
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
      }),

      this.prisma.order.count({ where: { createdAt: { gte: currentFrom } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: previousFrom, lt: currentFrom } },
      }),

      this.prisma.user.count({
        where: { role: Role.USER, createdAt: { gte: currentFrom } },
      }),
      this.prisma.user.count({
        where: {
          role: Role.USER,
          createdAt: { gte: previousFrom, lt: currentFrom },
        },
      }),

      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.product.count({
        where: { isActive: true, stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
      }),
      this.prisma.product.count({ where: { isActive: true, stock: 0 } }),
      this.prisma.contact.count({ where: { status: ContactStatus.PENDING } }),
    ]);

    const currentRevenue = Number(revenueCurrent._sum.amount ?? 0);
    const paidOrderCount = revenueCurrent._count;

    return {
      periodDays: days,
      revenue: this.metric(
        currentRevenue,
        Number(revenuePrevious._sum.amount ?? 0),
      ),
      orders: this.metric(ordersCurrent, ordersPrevious),
      customers: this.metric(customersCurrent, customersPrevious),
      averageOrderValue:
        paidOrderCount === 0
          ? 0
          : Math.round((currentRevenue / paidOrderCount) * 100) / 100,
      lifetimeRevenue: Number(lifetime._sum.amount ?? 0),
      pendingOrders,
      lowStockProducts,
      outOfStockProducts,
      unreadContacts,
    };
  }

  /**
   * Daily revenue and order counts.
   *
   * Grouped in SQL with date_trunc because Prisma cannot group by a date part.
   * Days with no sales are filled in afterwards — a chart that silently skips
   * empty days makes a quiet week look like a busy one.
   */
  async getRevenueSeries(days: number): Promise<RevenuePointDto[]> {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      { day: Date; revenue: Prisma.Decimal | null; orders: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS day,
             SUM("amount")                 AS revenue,
             COUNT(*)                      AS orders
      FROM payments
      WHERE "status" = 'COMPLETED'
        AND "createdAt" >= ${from}
      GROUP BY day
      ORDER BY day ASC
    `;

    const byDate = new Map(
      rows.map((row) => [
        row.day.toISOString().slice(0, 10),
        { revenue: Number(row.revenue ?? 0), orders: Number(row.orders) },
      ]),
    );

    const series: RevenuePointDto[] = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const point = byDate.get(date);

      series.push({
        date,
        revenue: point?.revenue ?? 0,
        orders: point?.orders ?? 0,
      });
    }

    return series;
  }

  /**
   * Best sellers by revenue.
   *
   * Raw SQL because the figure is SUM(price * quantity) — Prisma's groupBy can
   * only sum a single column. Cancelled orders are excluded so an abandoned
   * basket never counts as a sale.
   */
  async getTopProducts(days: number, limit: number): Promise<TopProductDto[]> {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        name: string;
        imageUrl: string | null;
        unitsSold: bigint;
        revenue: Prisma.Decimal;
      }[]
    >`
      SELECT oi."productId"                      AS "productId",
             MIN(oi."productName")               AS name,
             MIN(p."imageUrl")                   AS "imageUrl",
             SUM(oi."quantity")                  AS "unitsSold",
             SUM(oi."price" * oi."quantity")     AS revenue
      FROM order_items oi
      JOIN orders o  ON o."id" = oi."orderId"
      LEFT JOIN products p ON p."id" = oi."productId"
      WHERE o."status" <> 'CANCELLED'
        AND o."createdAt" >= ${from}
      GROUP BY oi."productId"
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      imageUrl: row.imageUrl,
      unitsSold: Number(row.unitsSold),
      revenue: Number(row.revenue),
    }));
  }

  /** How many orders sit in each status right now, for the funnel. */
  async getStatusBreakdown(): Promise<StatusBreakdownDto[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const counts = new Map(
      grouped.map((row) => [row.status, row._count.status]),
    );

    // Every status is listed, including the empty ones, so the chart legend
    // does not change shape as data arrives.
    return Object.values(OrderStatus).map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
  }

  private metric(current: number, previous: number): MetricDto {
    return {
      current: Math.round(current * 100) / 100,
      previous: Math.round(previous * 100) / 100,
      // Growth from zero is undefined, not infinite — the UI shows a dash.
      changePercent:
        previous === 0
          ? null
          : Math.round(((current - previous) / previous) * 1000) / 10,
    };
  }
}
