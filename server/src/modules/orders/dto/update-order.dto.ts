import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@/modules/orders/dto/query-order.dto';

// Body an admin may send when changing an order's status.
export class UpdateOrderDto {
  @ApiPropertyOptional({
    description: 'Order status',
    enum: OrderStatus,
    example: OrderStatus.SHIPPED,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Shipping address',
    example: '123 Le Loi, District 1, Ho Chi Minh City',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;
}
