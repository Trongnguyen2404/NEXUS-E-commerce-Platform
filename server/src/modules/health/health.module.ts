import { Module } from '@nestjs/common';
import { HealthController } from '@/modules/health/health.controller';

// Health check feature module.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
