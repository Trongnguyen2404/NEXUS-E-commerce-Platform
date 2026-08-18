import { ApiProperty } from '@nestjs/swagger';

// Envelope wrapping any order payload with a message.
export class OrderApiResponseDto<T> {
  @ApiProperty({
    description: 'Indicates if the request was successfull',
  })
  success: boolean;

  @ApiProperty({
    description: 'Returned data',
    type: Object,
  })
  data: T;

  @ApiProperty({
    description: 'Optional message',
    nullable: true,
    required: false,
  })
  message: string;
}

// One order line as returned by the API.
export class OrderItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty({
    nullable: true,
    description:
      'Variant bought, as it read at purchase time. Null for products without variants.',
    example: 'M / Black',
  })
  variantLabel: string | null;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  price: number;

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Order as returned by the API.
export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderNumber: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ description: 'Goods before discount, shipping and tax' })
  subtotal: number;

  @ApiProperty()
  discountAmount: number;

  @ApiProperty()
  shippingFee: number;

  @ApiProperty()
  taxAmount: number;

  @ApiProperty({ nullable: true, description: 'Promo code applied, if any' })
  couponCode: string | null;

  @ApiProperty({ description: 'subtotal - discount + shipping + tax' })
  total: number;

  @ApiProperty()
  shippingAddress: string;

  @ApiProperty({
    type: [OrderItemResponseDto],
  })
  items: OrderItemResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// A page of orders with its paging metadata.
export class PaginatedOrderResponseDto {
  @ApiProperty({
    type: [OrderResponseDto],
  })
  data: OrderResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
