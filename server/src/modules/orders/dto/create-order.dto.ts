import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// One line of a new order.
class OrderItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiProperty({
    required: false,
    description: 'Required when the product sells in variants.',
  })
  @IsOptional()
  @IsString()
  variantId?: string;
}
// Body for placing an order.
export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({
    required: false,
    description: 'Free-text address. Ignored when addressId is supplied.',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiProperty({
    required: false,
    description:
      'Id of a saved address belonging to the caller. Takes precedence over shippingAddress.',
  })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiProperty({
    required: false,
    description:
      'Promo code. The discount is recalculated server-side; nothing about the price is taken from the client.',
    example: 'WELCOME10',
  })
  @IsOptional()
  @IsString()
  couponCode?: string;
}
