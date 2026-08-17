import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product, ProductVariant } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CreateVariantDto,
  UpdateVariantDto,
  VariantResponseDto,
} from '@/modules/products/dto/variant.dto';

@Injectable()
export class VariantsService {
  constructor(private prisma: PrismaService) {}

  /** "M / Black" from { Size: "M", Color: "Black" }. */
  static labelFor(options: Record<string, string>): string {
    const parts = Object.values(options)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (parts.length === 0) {
      throw new BadRequestException('Options must contain at least one value');
    }

    return parts.join(' / ');
  }

  async findAll(productId: string): Promise<VariantResponseDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    return product.variants.map((variant) => this.map(variant, product));
  }

  async create(productId: string, dto: CreateVariantDto): Promise<VariantResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const sku = dto.sku.trim().toUpperCase();
    const clash = await this.prisma.productVariant.findUnique({ where: { sku } });
    if (clash) throw new ConflictException(`A variant with SKU ${sku} already exists`);

    const variant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({
        data: {
          productId,
          sku,
          options: dto.options as Prisma.InputJsonValue,
          label: VariantsService.labelFor(dto.options),
          price: dto.price ?? null,
          stock: dto.stock,
          imageUrl: dto.imageUrl ?? null,
          isActive: dto.isActive ?? true,
        },
      });

      // Adding the first variant flips the product over: from here on its own
      // price and stock columns stop being what customers buy against.
      if (!product.hasVariants) {
        await tx.product.update({ where: { id: productId }, data: { hasVariants: true } });
      }

      return created;
    });

    return this.map(variant, product);
  }

  async update(id: string, dto: UpdateVariantDto): Promise<VariantResponseDto> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const sku = dto.sku ? dto.sku.trim().toUpperCase() : undefined;
    if (sku && sku !== variant.sku) {
      const clash = await this.prisma.productVariant.findUnique({ where: { sku } });
      if (clash) throw new ConflictException(`A variant with SKU ${sku} already exists`);
    }

    const updated = await this.prisma.productVariant.update({
      where: { id },
      data: {
        ...(sku ? { sku } : {}),
        ...(dto.options
          ? {
              options: dto.options as Prisma.InputJsonValue,
              // The label is derived, so it has to move with the options.
              label: VariantsService.labelFor(dto.options),
            }
          : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.map(updated, variant.product);
  }

  async remove(id: string): Promise<{ message: string }> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    // Past orders point at the variant to explain what was bought. Deleting one
    // that has sold would break that, so deactivate it instead.
    if (variant._count.orderItems > 0) {
      await this.prisma.productVariant.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        message: `${variant.label} has been sold ${variant._count.orderItems} time(s), so it was deactivated rather than deleted`,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.delete({ where: { id } });

      // Removing the last variant hands control back to the product's own
      // price and stock columns.
      const remaining = await tx.productVariant.count({
        where: { productId: variant.productId },
      });
      if (remaining === 0) {
        await tx.product.update({
          where: { id: variant.productId },
          data: { hasVariants: false },
        });
      }
    });

    return { message: 'Variant deleted' };
  }

  private map(variant: ProductVariant, product: Product): VariantResponseDto {
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      options: variant.options as Record<string, string>,
      label: variant.label,
      // The effective price, so callers never have to know about the fallback.
      price: Number(variant.price ?? product.price),
      stock: variant.stock,
      imageUrl: variant.imageUrl,
      isActive: variant.isActive,
    };
  }
}
