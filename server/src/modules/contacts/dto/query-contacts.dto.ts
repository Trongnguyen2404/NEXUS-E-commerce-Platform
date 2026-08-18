import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Query string accepted when listing contact messages.
export class QueryContactsDto {
  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Caps how much one request can pull; ?limit=99999 was accepted before and
  // returned every submission, message bodies included, in a single response.
  @Max(100)
  @IsOptional()
  limit: number = 10;
}
