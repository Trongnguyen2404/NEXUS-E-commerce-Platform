import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, DiscountType, Prisma, ProductVariant } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

// Rounds to whole cents.
const money = (value: number): number => Math.round(value * 100) / 100;

// Reads a numeric setting from the environment with a fallback.
const numberFromEnv = (key: string, fallback: number): number => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export interface QuoteLine {
  productId: string;
  productName: string;

  variantId: string | null;

  variantLabel: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface BasketItem {
  productId: string;
  quantity: number;
  variantId?: string;
}

export interface AppliedCoupon {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  discountAmount: number;
}

export interface Quote {
  items: QuoteLine[];
  subtotal: number;
  discountAmount: number;
  coupon: AppliedCoupon | null;
  shippingFee: number;
  freeShippingThreshold: number;

  amountToFreeShipping: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

// Single source of truth for basket pricing: discounts, shipping and tax.
@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  private get config() {
    return {
      shippingFlatFee: numberFromEnv('SHIPPING_FLAT_FEE', 9.99),
      freeShippingThreshold: numberFromEnv('FREE_SHIPPING_THRESHOLD', 100),

      taxRate: numberFromEnv('TAX_RATE', 0.08),
    };
  }

  // Prices a basket, validating stock and resolving variant prices.
  async quote(
    items: BasketItem[],
    couponCode?: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Quote> {
    if (items.length === 0) {
      throw new BadRequestException('Cannot price an empty basket');
    }

    const { shippingFlatFee, freeShippingThreshold, taxRate } = this.config;

    const lines: QuoteLine[] = [];
    let subtotal = 0;

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(
          'Quantity must be a whole number of at least 1',
        );
      }

      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product) {
        throw new NotFoundException(
          `Product with ID ${item.productId} not found`,
        );
      }
      if (!product.isActive) {
        throw new BadRequestException(`${product.name} is no longer available`);
      }

      let variant: ProductVariant | null = null;

      if (product.hasVariants) {
        if (!item.variantId) {
          throw new BadRequestException(
            `Choose an option for ${product.name} before ordering`,
          );
        }

        variant = await tx.productVariant.findFirst({
          where: { id: item.variantId, productId: product.id },
        });

        if (!variant) {
          throw new NotFoundException(
            `That option is no longer available for ${product.name}`,
          );
        }
        if (!variant.isActive) {
          throw new BadRequestException(
            `${product.name} (${variant.label}) is no longer available`,
          );
        }
      } else if (item.variantId) {
        throw new BadRequestException(
          `${product.name} does not have options to choose from`,
        );
      }

      const availableStock = variant ? variant.stock : product.stock;
      const displayName = variant
        ? `${product.name} (${variant.label})`
        : product.name;

      if (availableStock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${displayName}. Available: ${availableStock}, Requested: ${item.quantity}`,
        );
      }

      const unitPrice = Number(variant?.price ?? product.price);
      const lineTotal = money(unitPrice * item.quantity);

      lines.push({
        productId: product.id,
        productName: product.name,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      });
      subtotal = money(subtotal + lineTotal);
    }

    const coupon = couponCode
      ? await this.applyCoupon(couponCode, subtotal, tx)
      : null;

    const discountAmount = coupon?.discountAmount ?? 0;
    const discountedSubtotal = money(subtotal - discountAmount);

    const shippingFee =
      discountedSubtotal >= freeShippingThreshold ? 0 : money(shippingFlatFee);

    const taxAmount = money(discountedSubtotal * taxRate);

    return {
      items: lines,
      subtotal,
      discountAmount,
      coupon,
      shippingFee,
      freeShippingThreshold,
      amountToFreeShipping:
        shippingFee === 0
          ? 0
          : money(freeShippingThreshold - discountedSubtotal),
      taxRate,
      taxAmount,
      total: money(discountedSubtotal + shippingFee + taxAmount),
    };
  }

  // Validates a promo code and applies its discount.
  private async applyCoupon(
    code: string,
    subtotal: number,
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<AppliedCoupon> {
    const coupon = await tx.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    const invalid = new BadRequestException('This promo code is not valid');

    if (!coupon || !coupon.isActive) throw invalid;

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw invalid;
    if (coupon.expiresAt && coupon.expiresAt < now) throw invalid;
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('This promo code has been fully redeemed');
    }

    const minOrder = coupon.minOrderAmount ? Number(coupon.minOrderAmount) : 0;
    if (subtotal < minOrder) {
      throw new BadRequestException(
        `Spend at least $${minOrder.toFixed(2)} to use this code`,
      );
    }

    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      discountAmount: this.discountFor(coupon, subtotal),
    };
  }

  // Works out the discount a coupon is worth on this subtotal.
  private discountFor(coupon: Coupon, subtotal: number): number {
    const value = Number(coupon.value);

    let discount =
      coupon.type === DiscountType.PERCENT
        ? money(subtotal * (value / 100))
        : money(value);

    if (coupon.maxDiscount) {
      discount = Math.min(discount, Number(coupon.maxDiscount));
    }

    return money(Math.min(discount, subtotal));
  }
}
