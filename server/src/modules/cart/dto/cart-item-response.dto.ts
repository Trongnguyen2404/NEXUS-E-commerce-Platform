import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';

/**
 * DTO for cart item response
 */
export class CartItemResponseDto {
  @ApiProperty({
    description: 'Cart item ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Cart ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  cartId: string;

  @ApiProperty({
    description: 'Product ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  productId: string;

  @ApiProperty({
    description: 'Quantity',
    example: 2,
  })
  quantity: number;

  @ApiPropertyOptional({
    description: 'Chosen variant, null when the product does not have any',
    nullable: true,
  })
  variantId: string | null;

  @ApiPropertyOptional({
    description: 'Rendered variant, e.g. "M / Black"',
    nullable: true,
    example: 'M / Black',
  })
  variantLabel: string | null;

  @ApiProperty({
    description:
      'What this line actually costs per unit — the variant price when there is one, otherwise the product price.',
    example: 39.99,
  })
  unitPrice: number;

  @ApiProperty({
    description: 'Stock left for this exact line (variant-aware)',
    example: 12,
  })
  availableStock: number;

  @ApiProperty({
    description: 'Product details',
    type: () => ProductResponseDto,
  })
  product: ProductResponseDto;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
