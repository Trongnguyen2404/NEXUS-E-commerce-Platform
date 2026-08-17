import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from '@/modules/payments/payments.service';

/**
 * Kept separate from PaymentsController because that controller is behind
 * JwtAuthGuard — Stripe has no JWT. Authenticity is proven by the signature
 * header instead, verified in PaymentsService.handleStripeEvent().
 */
@ApiTags('payments')
@Controller('payments')
export class StripeWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle() // Stripe batches retries; throttling them would drop events.
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return await this.paymentsService.handleStripeEvent(req.rawBody, signature);
  }
}
