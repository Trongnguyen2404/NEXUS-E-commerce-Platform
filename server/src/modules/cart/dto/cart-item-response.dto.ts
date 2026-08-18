import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';

// One cart line as returned by the API.
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
    description:
      'False when the line cannot be ordered as it stands, e.g. the product was deactivated or gained options after the line was added.',
    example: true,
  })
  isOrderable: boolean;

  @ApiPropertyOptional({
    description:
      'Why the line cannot be ordered, null when it can. Surfaced so the shopper can repair the line instead of only finding out at checkout.',
    nullable: true,
    example: 'Choose an option for Nexus Headphones before ordering',
  })
  unavailableReason: string | null;

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
