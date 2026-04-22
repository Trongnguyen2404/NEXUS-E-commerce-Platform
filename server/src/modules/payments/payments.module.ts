import { Module } from '@nestjs/common';
import { PaymentsController } from '@/modules/payments/payments.controller';
import { PaymentsService } from '@/modules/payments/payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService]
})
export class PaymentsModule {}
