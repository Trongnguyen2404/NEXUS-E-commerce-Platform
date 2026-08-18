import { ApiProperty } from '@nestjs/swagger';
import { VariantResponseDto } from '@/modules/products/dto/variant.dto';

// Product as returned by the API.
export class ProductResponseDto {
  @ApiProperty({
    description: 'Product ID',
    example: '46545646sds-4584s68sd-4654684sd',
  })
  id: string;

  @ApiProperty({
    description: 'Product name',
    example: 'Wireless Headphone',
  })
  name: string;

  @ApiProperty({
    description: 'Product description',
    example: 'High quality wireless headphones',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Product price',
    example: 99.99,
  })
  price: number;

  @ApiProperty({
    description: 'Product stock',
    example: 100,
  })
  stock: number;

  @ApiProperty({
    description: 'Stock keeping Unit',
    example: 'WH-001',
  })
  sku: string;

  @ApiProperty({
    description: 'Product image url',
    example: 'https://example.com/image.jpg',
  })
  imageUrl: string | null;

  @ApiProperty({
    description:
      'Every image, in display order. The first is the cover and matches imageUrl. ' +
      'Listings return at most the cover; the detail endpoint returns the full gallery.',
    type: [String],
    example: [
      'https://example.com/front.webp',
      'https://example.com/back.webp',
    ],
  })
  images: string[];

  @ApiProperty({
    description: 'Product category',
    example: 'Electronics',
  })
  category: string | null;

  @ApiProperty({
    description: 'Product availability status',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description:
      'True when this product sells in variants; price and stock then come from those.',
    example: false,
  })
  hasVariants: boolean;

  @ApiProperty({
    description: 'Variants, empty for products that do not use them',
    type: () => [VariantResponseDto],
  })
  variants: VariantResponseDto[];

  @ApiProperty({
    description: 'Mean review score, 0 when there are no reviews yet',
    example: 4.3,
  })
  rating: number;

  @ApiProperty({
    description: 'How many reviews this product has',
    example: 27,
  })
  reviewCount: number;

  @ApiProperty({
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'last update timestamp',
  })
  updatedAt: Date;
}
