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

/** Only ids and quantities. Prices are never accepted from the client. */
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
