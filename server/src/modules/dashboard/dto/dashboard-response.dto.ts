import { ApiProperty } from '@nestjs/swagger';

// One headline number plus its change on the previous period.
export class MetricDto {
  @ApiProperty({ description: 'Value for the selected period' })
  current: number;

  @ApiProperty({ description: 'Value for the equally long period before it' })
  previous: number;

  @ApiProperty({
    description:
      'Percent change vs the previous period. Null when the previous period was zero, because "up 100%" from nothing is meaningless.',
    nullable: true,
    example: 12.5,
  })
  changePercent: number | null;
}

// The dashboard's headline metrics.
export class DashboardOverviewDto {
  @ApiProperty({ description: 'Days covered by the current period' })
  periodDays: number;

  @ApiProperty({
    type: MetricDto,
    description: 'Money kept: completed payments less anything refunded',
  })
  revenue: MetricDto;

  @ApiProperty({ type: MetricDto, description: 'Orders placed' })
  orders: MetricDto;

  @ApiProperty({ type: MetricDto, description: 'New customer accounts' })
  customers: MetricDto;

  @ApiProperty({
    description: 'Mean value of a paid order in the period, net of refunds',
  })
  averageOrderValue: number;

  @ApiProperty({ description: 'All-time revenue kept, net of refunds' })
  lifetimeRevenue: number;

  @ApiProperty({ description: 'Orders waiting to be paid or actioned' })
  pendingOrders: number;

  @ApiProperty({
    description:
      'Active products with stock at or below the low-stock threshold',
  })
  lowStockProducts: number;

  @ApiProperty({ description: 'Active products with no stock at all' })
  outOfStockProducts: number;

  @ApiProperty({ description: 'Contact messages not yet read' })
  unreadContacts: number;
}

// One point on the revenue chart.
export class RevenuePointDto {
  @ApiProperty({ example: '2026-08-13', description: 'Date in UTC' })
  date: string;

  @ApiProperty({ example: 1299.5 })
  revenue: number;

  @ApiProperty({ example: 4 })
  orders: number;
}

// One row of the best sellers table.
export class TopProductDto {
  @ApiProperty() productId: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) imageUrl: string | null;
  @ApiProperty({ description: 'Units sold in the period' }) unitsSold: number;
  @ApiProperty({ description: 'Revenue generated in the period' })
  revenue: number;
}

// Order count for a single status.
export class StatusBreakdownDto {
  @ApiProperty({ example: 'PENDING' }) status: string;
  @ApiProperty({ example: 12 }) count: number;
}
