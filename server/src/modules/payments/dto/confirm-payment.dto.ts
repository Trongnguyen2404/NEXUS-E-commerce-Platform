import { IsNotEmpty, IsString } from 'class-validator';

// Body for confirming a payment against its order.
export class ConfirmPaymentDto {
  @IsNotEmpty()
  @IsString()
  paymentIntentId: string;

  @IsNotEmpty()
  @IsString()
  orderId: string;
}
