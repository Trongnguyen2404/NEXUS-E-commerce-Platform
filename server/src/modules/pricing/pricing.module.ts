import { Global, Module } from '@nestjs/common';
import { PricingService } from '@/modules/pricing/pricing.service';

/**
 * Global so orders, the checkout quote endpoint and anything else that needs a
 * price all resolve the same instance — there must be exactly one place that
 * decides what a basket costs.
 */
@Global()
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
