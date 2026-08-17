import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Liveness/readiness probe. Deployment platforms need an endpoint that fails
 * when the app cannot serve traffic — "the process is running" is not the same
 * as "the database is reachable", and only the second one matters to a user.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SkipThrottle() // Orchestrators poll this every few seconds.
  @ApiOperation({ summary: 'Service health and database connectivity' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async check() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Must be a non-2xx status, otherwise a load balancer keeps routing
      // traffic to an instance that cannot answer a single query.
      throw new ServiceUnavailableException(
        this.payload('error', 'down', Date.now() - startedAt),
      );
    }

    return this.payload('ok', 'up', Date.now() - startedAt);
  }

  @Get('ready')
  @SkipThrottle()
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async ready() {
    return this.check();
  }

  private payload(status: string, database: string, latencyMs: number) {
    return {
      status,
      database: { status: database, latencyMs },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
