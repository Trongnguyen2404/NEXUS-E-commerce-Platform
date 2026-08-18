import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

// Body for changing a cart line's quantity, and optionally its variant.
export class UpdateCartItemDto {
  @ApiProperty({
    description: 'New quantity for cart item',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Re-points this line at a variant. The repair path for a line added before the product gained options.',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  variantId?: string;
}
