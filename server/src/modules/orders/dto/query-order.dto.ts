import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * Re-exported so every DTO and service shares one definition.
 *
 * A second, hand-written copy of this enum used to live here. It type-checked
 * against the Prisma one only because the two lists happened to match, and
 * would have stopped matching silently the moment either changed.
 */
export { OrderStatus };

export class QueryOrderDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  // No @Type(() => Number) here, however much it looks like the two fields
  // above: Number('CANCELLED') is NaN, NaN is falsy, and the `if (status)`
  // guard in the service therefore never fired — filtering by status quietly
  // returned every order instead.
  @IsOptional()
  @IsEnum(OrderStatus, {
    message: `status must be one of ${Object.values(OrderStatus).join(', ')}`,
  })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
