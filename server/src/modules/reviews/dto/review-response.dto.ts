import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// One review as returned by the API.
export class ReviewResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() rating: number;
  @ApiPropertyOptional({ nullable: true }) title: string | null;
  @ApiPropertyOptional({ nullable: true }) comment: string | null;
  @ApiProperty() isVerifiedPurchase: boolean;
  @ApiProperty() productId: string;
  @ApiProperty() userId: string;

  @ApiProperty({
    description:
      'Reviewer display name. Never the email — that would publish it.',
    example: 'John D.',
  })
  authorName: string;

  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

// Average rating and the count for each star level.
export class ReviewSummaryDto {
  @ApiProperty({
    description: 'Mean rating, rounded to one decimal',
    example: 4.3,
  })
  average: number;

  @ApiProperty({ example: 27 })
  total: number;

  @ApiProperty({
    description: 'How many reviews gave each star count',
    example: { 1: 0, 2: 1, 3: 3, 4: 8, 5: 15 },
  })
  distribution: Record<number, number>;
}

// A page of reviews plus the product's rating summary.
export class PaginatedReviewsDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  data: ReviewResponseDto[];

  @ApiProperty({ type: ReviewSummaryDto })
  summary: ReviewSummaryDto;

  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}
