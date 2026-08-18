import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export { OrderStatus };

// Query string accepted when listing orders.
export class QueryOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  // Unconstrained before, so ?page=0 / ?page=abc reached Prisma's skip as -10
  // or NaN and came back a 500.
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Caps how much one request can pull; ?limit=99999 was accepted before.
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(OrderStatus, {
    message: `status must be one of ${Object.values(OrderStatus).join(', ')}`,
  })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
