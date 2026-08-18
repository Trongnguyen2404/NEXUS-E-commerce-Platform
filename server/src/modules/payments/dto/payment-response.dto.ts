import { ApiProperty } from '@nestjs/swagger';

// Client secret and payment id handed back to Stripe.js.
export class CreatePaymentIntentResponse {
  @ApiProperty({
    example: 'pi_165465465',
    description: 'Stripe client secret for payment confirmation',
  })
  clientSecret: string;

  @ApiProperty({
    example: '2165465-454-sds4s854d65',
    description: 'Payment ID in database',
  })
  paymentId: string;
}

// Payment as returned by the API.
export class PaymentResponseDto {
  @ApiProperty({
    example: '1215645s454sdosd4s-454sd',
  })
  id: string;

  @ApiProperty({
    example: 'order-123',
  })
  orderId: string;

  @ApiProperty({
    example: 99.99,
  })
  amount: number;

  @ApiProperty({
    example: 'user-456',
  })
  userId: string;

  @ApiProperty({
    example: 'usd',
  })
  currency: string;

  @ApiProperty({
    example: 'COMPLETED',
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  })
  status: string;

  @ApiProperty({
    example: 'STRIPE',
    nullable: true,
  })
  paymentMethod: string | null;

  @ApiProperty({
    example: 'pi_1213546846',
    nullable: true,
  })
  transactionId: string | null;

  @ApiProperty({})
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Envelope wrapping a payment payload with a message.
export class PaymentApiResponseDto {
  @ApiProperty({
    example: true,
  })
  success: boolean;

  @ApiProperty({
    type: PaymentResponseDto,
  })
  data: PaymentResponseDto;

  @ApiProperty({
    example: 'Payment retrieved successfully',
    required: false,
  })
  message?: string;
}

// Envelope wrapping a new payment intent with a message.
export class CreatePaymentIntentApiResponseDto {
  @ApiProperty({
    example: true,
  })
  success: boolean;

  @ApiProperty({
    type: CreatePaymentIntentResponse,
  })
  data: CreatePaymentIntentResponse;

  @ApiProperty({
    example: 'Payment intent created successfully',
    required: false,
  })
  message?: string;
}
