import { Module } from '@nestjs/common';
import { PaymentsController } from '@/modules/payments/payments.controller';
import { PaymentsService } from '@/modules/payments/payments.service';
import { StripeWebhookController } from '@/modules/payments/stripe-webhook.controller';

@Module({
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
