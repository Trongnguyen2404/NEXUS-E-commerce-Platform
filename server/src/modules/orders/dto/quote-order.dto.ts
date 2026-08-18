import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// One line of a basket being priced.
class QuoteItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Required when the product sells in variants.',
  })
  @IsOptional()
  @IsString()
  variantId?: string;
}

// Body for pricing a basket before the order exists.
export class QuoteOrderDto {
  @ApiProperty({ type: [QuoteItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one item to price a basket' })
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  @ApiPropertyOptional({ example: 'WELCOME10' })
  @IsOptional()
  @IsString()
  couponCode?: string;
}
