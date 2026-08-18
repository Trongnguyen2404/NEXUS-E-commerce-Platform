import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Query string accepted by the dashboard endpoints.
export class QueryDashboardDto {
  @ApiPropertyOptional({
    description: 'Size of the reporting window in days',
    minimum: 1,

    maximum: 365,
    default: 30,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  days: number = 30;

  @ApiPropertyOptional({
    description: 'How many rows to return (top products)',
    minimum: 1,
    maximum: 20,
    default: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit: number = 5;
}
