import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  // Codes are typed by customers, so keep them unambiguous and case-insensitive
  // (the service uppercases before lookup).
  @Matches(/^[A-Za-z0-9_-]{3,32}$/, {
    message: 'Code must be 3–32 characters, letters/numbers/dash/underscore only',
  })
  code: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENT })
  @IsEnum(DiscountType, { message: 'Type must be PERCENT or FIXED' })
  type: DiscountType;

  @ApiProperty({ description: 'PERCENT: 10 = 10%. FIXED: 10 = $10 off.', example: 10 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Value must be greater than zero' })
  value: number;

  @ApiPropertyOptional({ description: 'Basket must reach this before the code applies' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Ceiling for a PERCENT discount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscount?: number;

  @ApiPropertyOptional({ description: 'Total redemptions allowed. Omit for unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'startsAt must be an ISO date' })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt must be an ISO date' })
  expiresAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class CouponResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: DiscountType }) type: DiscountType;
  @ApiProperty() value: number;
  @ApiPropertyOptional({ nullable: true }) minOrderAmount: number | null;
  @ApiPropertyOptional({ nullable: true }) maxDiscount: number | null;
  @ApiPropertyOptional({ nullable: true }) maxUses: number | null;
  @ApiProperty() usedCount: number;
  @ApiPropertyOptional({ nullable: true }) startsAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) expiresAt: Date | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
