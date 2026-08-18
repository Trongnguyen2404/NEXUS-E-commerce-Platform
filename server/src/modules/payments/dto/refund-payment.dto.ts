import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// Body for refunding a payment, in full or in part.
export class RefundPaymentDto {
  @ApiPropertyOptional({
    description:
      'Amount to refund. Omit to refund everything still outstanding on this payment.',
    example: 25.5,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Amount must have at most 2 decimal places' },
  )
  @Min(0.01, { message: 'Refund amount must be greater than zero' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Why the refund was issued. Stored for the audit trail.',
    example: 'Item arrived damaged',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
