import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';
import { Category, Prisma, Product, ProductVariant } from "@prisma/client";
import { QueryProductDto, ProductSort } from '@/modules/products/dto/query-product.dto';
import { UpdateProductDto } from '@/modules/products/dto/update-product.dto';
import { ReviewsService } from '@/modules/reviews/reviews.service';

@Injectable()
export class ProductsService {
    constructor(
        private prisma: PrismaService,
        private reviewsService: ReviewsService,
    ) { }

    /** Attaches review scores to a page of products in one extra query. */
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

    // Create product
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

    // Get all product
    async findAll(queryDto: QueryProductDto): Promise<{
        data: ProductResponseDto[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            /** Cheapest and dearest product matching everything EXCEPT the price
             *  filter, so a price slider keeps stable bounds while being dragged. */
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

        // Everything except price. Reused for the price-range aggregate below.
        const baseWhere: Prisma.ProductWhereInput = {};

        if (category) {
            baseWhere.category = {
                OR: [
                    {
                        id: category
                    },
                    {
                        name: {
                            equals: category,
                            mode: 'insensitive'
                        }
                    },
                    {
                        slug: {
                            equals: category,
                            mode: 'insensitive'
                        }
                    }
                ]
            };
        }

        if (isActive !== undefined) {
            baseWhere.isActive = isActive;
        }

        if (search) {
            baseWhere.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (inStock) {
            baseWhere.stock = { gt: 0 };
        }

        const where: Prisma.ProductWhereInput = { ...baseWhere };

        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {
                ...(minPrice !== undefined ? { gte: minPrice } : {}),
                ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
            };
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

    /**
     * `popular` sorts by review count, which Prisma can do natively on a
     * relation. Sorting by AVERAGE rating is deliberately absent: Prisma cannot
     * order by an aggregate of a relation, and faking it in memory would break
     * pagination. That needs a denormalised column on Product first.
     */
    private buildOrderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput {
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

    // Get product by id
    async findOne(id: string): Promise<ProductResponseDto> {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: {
                category: true,
                variants: true,
            },
        });
        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return (await this.withRatings([product]))[0];
    }

    // Update product
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

    // Update product stock
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
                const productExists = await this.prisma.product.findUnique({ where: { id } });
                if (!productExists) {
                    throw new NotFoundException('Product not found');
                }
                throw new BadRequestException('Insufficient stock to perform this operation');
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

    // Remove a product
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

        await this.prisma.product.delete({
            where: { id },
        });

        return { message: 'Product deleted successfully' };
    }

    private formatProduct(
        product: Product & { category: Category; variants?: ProductVariant[] },
        rating?: { average: number; total: number },
    ): ProductResponseDto {
        const variants = product.variants ?? [];
        const activeVariants = variants.filter((variant) => variant.isActive);

        return {
            ...product,
            // For a variant product the headline figures are derived: the price
            // shown is the cheapest option ("from $X"), and stock is what is
            // actually buyable across the active options. The product's own
            // columns are stale once variants exist.
            price: product.hasVariants && activeVariants.length > 0
                ? Math.min(...activeVariants.map((v) => Number(v.price ?? product.price)))
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
            // Zero rather than null so the client can render stars without a
            // null check on every card.
            rating: rating?.average ?? 0,
            reviewCount: rating?.total ?? 0,
        };
    }
}
