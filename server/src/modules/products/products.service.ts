import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';
import {
  Category,
  Prisma,
  Product,
  ProductImage,
  ProductVariant,
} from '@prisma/client';
import {
  QueryProductDto,
  ProductSort,
} from '@/modules/products/dto/query-product.dto';
import { UpdateProductDto } from '@/modules/products/dto/update-product.dto';
import { ReviewsService } from '@/modules/reviews/reviews.service';

// Product reads and writes, including images, stock and rating joins.
@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private reviewsService: ReviewsService,
  ) {}

  // Attaches review summaries to a batch of products in one query.
  private async withRatings(
    products: (Product & { category: Category; variants: ProductVariant[] })[],
  ): Promise<ProductResponseDto[]> {
    const ratings = await this.reviewsService.summariseMany(
      products.map((product) => product.id),
    );

    return products.map((product) =>
      this.formatProduct(product, ratings.get(product.id)),
    );
  }

  // Creates a product, rejecting a duplicate SKU.
  async create(
    createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    const existingSku = await this.prisma.product.findUnique({
      where: { sku: createProductDto.sku },
    });
    if (existingSku) {
      throw new ConflictException(
        `Product with SKU ${createProductDto.sku} already exist`,
      );
    }

    const product = await this.prisma.product.create({
      data: {
        ...createProductDto,
        price: new Prisma.Decimal(createProductDto.price),
      },
      include: {
        category: true,
        variants: true,
      },
    });

    return this.formatProduct(product);
  }

  // Lists products, defaulting to active only, with search and filters.
  // isAdmin comes from the caller's token; the route itself is public.
  async findAll(
    queryDto: QueryProductDto,
    isAdmin = false,
  ): Promise<{
    data: ProductResponseDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;

      priceRange: { min: number; max: number };
    };
  }> {
    const {
      category,
      isActive,
      search,
      minPrice,
      maxPrice,
      inStock,
      sort = 'newest',
      page = 1,
      limit = 10,
    } = queryDto;

    const baseWhere: Prisma.ProductWhereInput = {};

    if (category) {
      baseWhere.category = {
        OR: [
          {
            id: category,
          },
          {
            name: {
              equals: category,
              mode: 'insensitive',
            },
          },
          {
            slug: {
              equals: category,
              mode: 'insensitive',
            },
          },
        ],
      };
    }

    // This endpoint is public, so a client-supplied isActive is only honoured
    // for an admin; anyone else always gets the storefront view.
    baseWhere.isActive = isAdmin ? (isActive ?? true) : true;

    // Every narrowing goes through AND so the stock and price filters can each
    // carry their own OR without overwriting one another.
    const narrowings: Prisma.ProductWhereInput[] = [];

    if (search) {
      narrowings.push(
        ...search.split(' ').map(
          (word): Prisma.ProductWhereInput => ({
            OR: [
              { name: { contains: word, mode: 'insensitive' } },
              { description: { contains: word, mode: 'insensitive' } },
            ],
          }),
        ),
      );
    }

    if (inStock) {
      narrowings.push({ OR: ProductsService.inStockWhere() });
    }

    if (narrowings.length > 0) {
      baseWhere.AND = narrowings;
    }

    const where: Prisma.ProductWhereInput = { ...baseWhere };

    if (minPrice !== undefined || maxPrice !== undefined) {
      const range = {
        ...(minPrice !== undefined ? { gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
      };
      where.AND = [...narrowings, { OR: ProductsService.priceWhere(range) }];
    }

    const [total, products, bounds] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: this.buildOrderBy(sort),
        include: {
          category: true,
          variants: true,
        },
      }),
      this.prisma.product.aggregate({
        where: baseWhere,
        _min: { price: true },
        _max: { price: true },
      }),
    ]);

    return {
      data: await this.withRatings(products),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        priceRange: {
          min: Number(bounds._min.price ?? 0),
          max: Number(bounds._max.price ?? 0),
        },
      },
    };
  }

  // Availability lives on the active variants once a product sells in them:
  // nothing maintains products.stock after that, and formatProduct reports the
  // variant total, so filtering the column would contradict the response.
  private static inStockWhere(): Prisma.ProductWhereInput[] {
    return [
      { hasVariants: false, stock: { gt: 0 } },
      {
        hasVariants: true,
        variants: { some: { isActive: true, stock: { gt: 0 } } },
      },
    ];
  }

  // Same split for price. The base column still appears on the variant
  // branches because a variant with a null price inherits it, and because a
  // product whose variants are all retired falls back to it.
  private static priceWhere(range: {
    gte?: number;
    lte?: number;
  }): Prisma.ProductWhereInput[] {
    return [
      { hasVariants: false, price: range },
      {
        hasVariants: true,
        variants: { some: { isActive: true, price: range } },
      },
      {
        hasVariants: true,
        price: range,
        variants: { some: { isActive: true, price: null } },
      },
      {
        hasVariants: true,
        price: range,
        variants: { none: { isActive: true } },
      },
    ];
  }

  // Translates the sort key into a Prisma order clause.
  private buildOrderBy(
    sort: ProductSort,
  ): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'price_asc':
        return { price: 'asc' };
      case 'price_desc':
        return { price: 'desc' };
      case 'name_asc':
        return { name: 'asc' };
      case 'name_desc':
        return { name: 'desc' };
      case 'popular':
        return { reviews: { _count: 'desc' } };
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  // Loads one product with its variants and rating.
  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: true,
        images: { orderBy: { position: 'asc' } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return (await this.withRatings([product]))[0];
  }

  // Replaces a product's images in one transaction, keeping the first as cover.
  async setImages(id: string, urls: string[]): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.$transaction([
      this.prisma.productImage.deleteMany({ where: { productId: id } }),
      this.prisma.productImage.createMany({
        data: urls.map((url, position) => ({ productId: id, url, position })),
      }),

      this.prisma.product.update({
        where: { id },
        data: { imageUrl: urls[0] ?? null },
      }),
    ]);

    return await this.findOne(id);
  }

  // Updates a product.
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    if (updateProductDto.sku && updateProductDto.sku !== existingProduct.sku) {
      const skuTaken = await this.prisma.product.findUnique({
        where: { sku: updateProductDto.sku },
      });

      if (skuTaken) {
        throw new ConflictException(
          `Product with SKU ${updateProductDto.sku} already exists`,
        );
      }
    }

    const updateData: any = { ...updateProductDto };
    if (updateProductDto.price !== undefined) {
      updateData.price = new Prisma.Decimal(updateProductDto.price);
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        variants: true,
      },
    });

    return (await this.withRatings([updatedProduct]))[0];
  }

  // Adds to or subtracts from a product's stock.
  async updateStock(id: string, quantity: number): Promise<ProductResponseDto> {
    if (quantity < 0) {
      const result = await this.prisma.product.updateMany({
        where: {
          id: id,
          stock: { gte: Math.abs(quantity) },
        },
        data: {
          stock: { increment: quantity },
        },
      });

      if (result.count === 0) {
        const productExists = await this.prisma.product.findUnique({
          where: { id },
        });
        if (!productExists) {
          throw new NotFoundException('Product not found');
        }
        throw new BadRequestException(
          'Insufficient stock to perform this operation',
        );
      }
    } else {
      const result = await this.prisma.product.updateMany({
        where: { id: id },
        data: {
          stock: { increment: quantity },
        },
      });

      if (result.count === 0) {
        throw new NotFoundException('Product not found');
      }
    }

    const updatedProduct = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });

    return (await this.withRatings([updatedProduct!]))[0];
  }

  // Deletes a product.
  async remove(id: string): Promise<{ message: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        orderItems: true,
        cartItems: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.orderItems.length > 0) {
      throw new BadRequestException(
        'Cannot delete product that is part of existing orders. Consider marking it as inactive only',
      );
    }

    // CartItem.product restricts the delete instead of cascading like the
    // wishlist and image rows do, so a line in someone's basket would fail the
    // delete with a foreign-key error reported as "might be in an order".
    await this.prisma.$transaction(async (tx) => {
      if (product.cartItems.length > 0) {
        await tx.cartItem.deleteMany({ where: { productId: id } });
      }

      await tx.product.delete({ where: { id } });
    });

    return { message: 'Product deleted successfully' };
  }

  // Shapes a product row into its API response.
  private formatProduct(
    product: Product & {
      category: Category;
      variants?: ProductVariant[];
      images?: ProductImage[];
    },
    rating?: { average: number; total: number },
  ): ProductResponseDto {
    const variants = product.variants ?? [];
    const activeVariants = variants.filter((variant) => variant.isActive);

    return {
      ...product,

      images: product.images
        ? product.images.map((image) => image.url)
        : product.imageUrl
          ? [product.imageUrl]
          : [],

      price:
        product.hasVariants && activeVariants.length > 0
          ? Math.min(
              ...activeVariants.map((v) => Number(v.price ?? product.price)),
            )
          : Number(product.price),
      stock: product.hasVariants
        ? activeVariants.reduce((sum, v) => sum + v.stock, 0)
        : product.stock,
      hasVariants: product.hasVariants,
      variants: variants.map((variant) => ({
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
