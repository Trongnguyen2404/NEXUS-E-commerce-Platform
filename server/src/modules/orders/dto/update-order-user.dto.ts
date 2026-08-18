import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Body a customer may send when changing their own order.
export class UpdateOrderUserDto {
  @ApiPropertyOptional({
    description: 'Shipping address (only while the order is still PENDING)',
    example: '123 Le Loi, District 1, Ho Chi Minh City',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;
}
