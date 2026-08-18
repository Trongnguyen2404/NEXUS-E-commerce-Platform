import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Body for opening a Stripe payment intent.
export class CreatePaymentIntentDto {
  @IsNotEmpty()
  @IsString()
  orderId: string;

  // No `currency` here on purpose: order totals are computed in the store's own
  // currency, so letting the client name another one changes what it actually
  // pays. The server picks the currency; anything sent here is rejected by the
  // global whitelisting validation pipe.

  @IsOptional()
  @IsString()
  description?: string;
}
