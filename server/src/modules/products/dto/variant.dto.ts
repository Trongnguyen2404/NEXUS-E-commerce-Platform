import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({ example: 'TSHIRT-M-BLACK' })
  @IsString()
  @IsNotEmpty({ message: 'SKU is required' })
  @Matches(/^[A-Za-z0-9_-]{2,64}$/, {
    message: 'SKU must be 2–64 characters, letters/numbers/dash/underscore only',
  })
  sku: string;

  @ApiProperty({
    description: 'What distinguishes this variant',
    example: { Size: 'M', Color: 'Black' },
  })
  @IsObject({ message: 'Options must be an object like { "Size": "M" }' })
  options: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Overrides the product price. Omit to inherit it.',
    example: 24.99,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiProperty({ example: 25, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ description: 'Variant-specific image' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class VariantResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() sku: string;
  @ApiProperty({ example: { Size: 'M', Color: 'Black' } })
  options: Record<string, string>;
  @ApiProperty({ description: 'Rendered options, e.g. "M / Black"', example: 'M / Black' })
  label: string;
  @ApiProperty({ description: 'Effective price — the variant price, or the product price' })
  price: number;
  @ApiProperty() stock: number;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty() isActive: boolean;
}
