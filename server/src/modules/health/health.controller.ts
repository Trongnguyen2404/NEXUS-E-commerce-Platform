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
