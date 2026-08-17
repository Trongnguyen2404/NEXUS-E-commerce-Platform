import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

// What the order's owner is allowed to change. `status` is deliberately absent:
// only an ADMIN (or the payment flow) may move an order along its lifecycle.
export class UpdateOrderUserDto {
  @ApiPropertyOptional({
    description: 'Shipping address (only while the order is still PENDING)',
    example: '123 Le Loi, District 1, Ho Chi Minh City',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;
}
