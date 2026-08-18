import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@/prisma/prisma.service';

// Liveness and readiness probes.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Reports that the process is up and the database answers.
  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Service health and database connectivity' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async check() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException(
        this.payload('error', 'down', Date.now() - startedAt),
      );
    }

    return this.payload('ok', 'up', Date.now() - startedAt);
  }

  // Reports whether the app is ready to take traffic.
  @Get('ready')
  @SkipThrottle()
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async ready() {
    return this.check();
  }

  // Says the process is up, deliberately without touching the database.
  //
  // This is the route the keep-alive pinger calls. /health and /health/ready
  // both run a query, and on a free Neon plan that would hold the compute open
  // around the clock — the plan allows about 400 running hours a month against
  // a ~730-hour month, so pinging those would suspend the database mid-month.
  // Keeping the web service warm and letting the database sleep is the point:
  // Neon wakes in a few hundred milliseconds, the web service takes a minute.
  @Get('live')
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness only — does not query the database' })
  @ApiResponse({ status: 200, description: 'Process is running' })
  live() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  // Builds the health response body.
  private payload(status: string, database: string, latencyMs: number) {
    return {
      status,
      database: { status: database, latencyMs },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
