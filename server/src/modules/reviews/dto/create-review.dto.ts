import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Body for posting or editing a product review.
export class CreateReviewDto {
  @ApiProperty({
    description: 'Star rating',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @Type(() => Number)
  @IsInt({ message: 'Rating must be a whole number of stars' })
  @Min(1, { message: 'Rating must be between 1 and 5' })
  @Max(5, { message: 'Rating must be between 1 and 5' })
  rating: number;

  @ApiPropertyOptional({
    description: 'Short headline',
    example: 'Great sound for the price',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Title must be 120 characters or fewer' })
  title?: string;

  @ApiPropertyOptional({ description: 'Full review text' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Comment must be 2000 characters or fewer' })
  comment?: string;
}
