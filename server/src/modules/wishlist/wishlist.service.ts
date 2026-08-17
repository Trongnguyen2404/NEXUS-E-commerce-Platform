import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import { Category, Product, ProductVariant } from '@prisma/client';

@Injectable()
export class WishlistService {
  constructor(
    private prisma: PrismaService,
    private reviewsService: ReviewsService,
  ) {}

  async findAll(userId: string): Promise<{ data: ProductResponseDto[]; total: number }> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: { category: true, variants: true } } },
    });

    const products = items.map((item) => item.product);
    const ratings = await this.reviewsService.summariseMany(
      products.map((product) => product.id),
    );

    return {
      data: products.map((product) =>
        this.formatProduct(product, ratings.get(product.id)),
      ),
      total: items.length,
    };
  }

  /**
   * Idempotent: adding something already saved is a no-op rather than a 409.
   * A heart button that errors on a double click is worse than one that doesn't.
   */
  async add(userId: string, productId: string): Promise<{ message: string; inWishlist: true }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });

    return { message: 'Added to your wishlist', inWishlist: true };
  }

  /** Also idempotent — removing something absent is still "not in the wishlist". */
  async remove(userId: string, productId: string): Promise<{ message: string; inWishlist: false }> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return { message: 'Removed from your wishlist', inWishlist: false };
  }

  /** Single round trip for the heart button on a product page. */
  async toggle(userId: string, productId: string): Promise<{ message: string; inWishlist: boolean }> {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });

    return existing ? this.remove(userId, productId) : this.add(userId, productId);
  }

  // Mirrors ProductsService.formatProduct so the wishlist returns product
  // objects in exactly the shape the client already renders.
  private formatProduct(
    product: Product & { category: Category; variants: ProductVariant[] },
    rating?: { average: number; total: number },
  ): ProductResponseDto {
    const activeVariants = product.variants.filter((variant) => variant.isActive);

    return {
      ...product,
      // Mirrors ProductsService.formatProduct: for a variant product the price
      // shown is the cheapest option and the stock is the buyable total.
      price:
        product.hasVariants && activeVariants.length > 0
          ? Math.min(...activeVariants.map((v) => Number(v.price ?? product.price)))
          : Number(product.price),
      stock: product.hasVariants
        ? activeVariants.reduce((sum, v) => sum + v.stock, 0)
        : product.stock,
      hasVariants: product.hasVariants,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        options: variant.options as Record<string, string>,
        label: variant.label,
        price: Number(variant.price ?? product.price),
        stock: variant.stock,
        imageUrl: variant.imageUrl,
        isActive: variant.isActive,
      })),
      category: product.category.name,
      rating: rating?.average ?? 0,
      reviewCount: rating?.total ?? 0,
    };
  }
}
