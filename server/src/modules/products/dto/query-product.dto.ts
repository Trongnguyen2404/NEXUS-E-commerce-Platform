import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

/** Sort keys the client may ask for. Anything else is rejected by IsIn. */
export const PRODUCT_SORTS = [
    'newest',
    'oldest',
    'price_asc',
    'price_desc',
    'name_asc',
    'name_desc',
    'popular',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Query params sent as strings; "false" is truthy, so convert explicitly. */
const toBoolean = ({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
};

export class QueryProductDto {
    @ApiPropertyOptional({
        description: 'Filter by category id, name or slug',
        example: 'Electronics',
    })
    @IsString()
    @IsOptional()
    category?: string;

    @ApiPropertyOptional({
        description: 'Filter by active status',
        example: true,
    })
    @Transform(toBoolean)
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @ApiPropertyOptional({
        description: 'Search by product name',
        example: 'headphones',
    })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({
        description: 'Lowest price to include',
        example: 50,
        minimum: 0,
    })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    minPrice?: number;

    @ApiPropertyOptional({
        description: 'Highest price to include',
        example: 500,
        minimum: 0,
    })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    maxPrice?: number;

    @ApiPropertyOptional({
        description: 'Only products with stock left',
        example: true,
    })
    @Transform(toBoolean)
    @IsBoolean()
    @IsOptional()
    inStock?: boolean;

    @ApiPropertyOptional({
        description: 'Sort order',
        enum: PRODUCT_SORTS,
        default: 'newest',
    })
    @IsIn(PRODUCT_SORTS, {
        message: `sort must be one of: ${PRODUCT_SORTS.join(', ')}`,
    })
    @IsOptional()
    sort: ProductSort = 'newest';

    @ApiPropertyOptional({
        description: 'Page number for pagination',
        example: 1,
        minimum: 1,
        default: 1,
    })
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @IsOptional()
    page: number = 1;

    @ApiPropertyOptional({
        description: 'Number of items per page',
        example: 10,
        minimum: 1,
        default: 10,
    })
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @IsOptional()
    limit: number = 10;
}
