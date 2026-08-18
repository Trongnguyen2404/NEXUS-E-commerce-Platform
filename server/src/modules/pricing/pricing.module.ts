import { Global, Module } from '@nestjs/common';
import { PricingService } from '@/modules/pricing/pricing.service';

// Makes the pricing service available everywhere.
@Global()
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
