import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RelaxedThrottle } from '@/common/decorators/custom-throttler.decorator';
import { DashboardService } from '@/modules/dashboard/dashboard.service';
import { QueryDashboardDto } from '@/modules/dashboard/dto/query-dashboard.dto';
import {
  DashboardOverviewDto,
  RevenuePointDto,
  StatusBreakdownDto,
  TopProductDto,
} from '@/modules/dashboard/dto/dashboard-response.dto';

// Admin-only endpoints feeding the dashboard charts.
@ApiTags('dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiForbiddenResponse({ description: 'Admin access required' })
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // Returns the headline metrics with their period-on-period change.
  @Get('overview')
  @RelaxedThrottle()
  @ApiOperation({
    summary: '[ADMIN] Headline metrics with period-over-period comparison',
  })
  @ApiOkResponse({ type: DashboardOverviewDto })
  async overview(@Query() query: QueryDashboardDto) {
    return await this.dashboardService.getOverview(query.days);
  }

  // Returns revenue per day for the requested window.
  @Get('revenue')
  @RelaxedThrottle()
  @ApiOperation({
    summary: '[ADMIN] Daily revenue and order counts',
    description:
      'Days without sales are returned as zeroes rather than omitted.',
  })
  @ApiOkResponse({ type: [RevenuePointDto] })
  async revenue(@Query() query: QueryDashboardDto) {
    return await this.dashboardService.getRevenueSeries(query.days);
  }

  // Returns the best selling products for the window.
  @Get('top-products')
  @RelaxedThrottle()
  @ApiOperation({ summary: '[ADMIN] Best selling products by revenue' })
  @ApiOkResponse({ type: [TopProductDto] })
  async topProducts(@Query() query: QueryDashboardDto) {
    return await this.dashboardService.getTopProducts(query.days, query.limit);
  }

  // Returns how many orders sit in each status.
  @Get('order-status')
  @RelaxedThrottle()
  @ApiOperation({ summary: '[ADMIN] How many orders sit in each status' })
  @ApiOkResponse({ type: [StatusBreakdownDto] })
  async orderStatus() {
    return await this.dashboardService.getStatusBreakdown();
  }
}
