import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { PricingService } from '@/modules/pricing/pricing.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { aCoupon, aProduct, aVariant, money } from '@/common/testing/factories';

describe('PricingService', () => {
  let prisma: PrismaMock;
  let pricing: PricingService;

  const ENV = { ...process.env };

  beforeEach(() => {
    prisma = createPrismaMock();
    pricing = new PricingService(prisma as unknown as PrismaService);
    process.env.SHIPPING_FLAT_FEE = '9.99';
    process.env.FREE_SHIPPING_THRESHOLD = '100';
    process.env.TAX_RATE = '0.08';
  });

  afterEach(() => {
    resetPrismaMock(prisma);
    process.env = { ...ENV };
  });

  const givenProduct = (over: Record<string, unknown> = {}) => {
    const product = aProduct(over);
    prisma.product.findUnique.mockResolvedValue(product as never);
    return product;
  };

  const givenVariant = (over: Record<string, unknown> = {}) => {
    const variant = aVariant(over);
    prisma.productVariant.findFirst.mockResolvedValue(variant as never);
    return variant;
  };

  const givenCoupon = (over: Record<string, unknown> = {}) => {
    const coupon = aCoupon(over);
    prisma.coupon.findUnique.mockResolvedValue(coupon as never);
    return coupon;
  };

  describe('basket validation', () => {
    it('refuses an empty basket', async () => {
      await expect(pricing.quote([])).rejects.toThrow(BadRequestException);
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'refuses quantity %p',
      async (quantity) => {
        givenProduct();
        await expect(
          pricing.quote([{ productId: 'prod-1', quantity }]),
        ).rejects.toThrow('Quantity must be a whole number of at least 1');
      },
    );

    it('refuses a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);
      await expect(
        pricing.quote([{ productId: 'ghost', quantity: 1 }]),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a product that has been deactivated', async () => {
      givenProduct({ isActive: false, name: 'Retired Hub' });
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 1 }]),
      ).rejects.toThrow('Retired Hub is no longer available');
    });

    it('refuses more units than are in stock', async () => {
      givenProduct({ stock: 2 });
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 3 }]),
      ).rejects.toThrow(/Available: 2, Requested: 3/);
    });

    it('allows taking exactly the last unit', async () => {
      givenProduct({ stock: 3, price: money(10) });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 3 }]);
      expect(quote.subtotal).toBe(30);
    });
  });

  describe('variants', () => {
    it('refuses a variant product with no option chosen', async () => {
      givenProduct({ hasVariants: true, name: 'DeskLink' });
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 1 }]),
      ).rejects.toThrow('Choose an option for DeskLink before ordering');
    });

    it('refuses an option on a product that has none', async () => {
      givenProduct({ hasVariants: false, name: 'Plain Mouse' });
      await expect(
        pricing.quote([
          { productId: 'prod-1', quantity: 1, variantId: 'var-1' },
        ]),
      ).rejects.toThrow('Plain Mouse does not have options to choose from');
    });

    it('refuses a variant that belongs to a different product', async () => {
      givenProduct({ hasVariants: true });
      prisma.productVariant.findFirst.mockResolvedValue(null as never);

      await expect(
        pricing.quote([
          { productId: 'prod-1', quantity: 1, variantId: 'someone-elses' },
        ]),
      ).rejects.toThrow(NotFoundException);

      // The lookup must be scoped to the product, not just the variant id.
      expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
        where: { id: 'someone-elses', productId: 'prod-1' },
      });
    });

    it('refuses a deactivated variant', async () => {
      givenProduct({ hasVariants: true, name: 'DeskLink' });
      givenVariant({ isActive: false, label: '10-in-1' });
      await expect(
        pricing.quote([
          { productId: 'prod-1', quantity: 1, variantId: 'var-1' },
        ]),
      ).rejects.toThrow('DeskLink (10-in-1) is no longer available');
    });

    it('prices from the variant, not the product', async () => {
      givenProduct({ hasVariants: true, price: money(100) });
      givenVariant({
        price: money(149),
        stock: 5,
        label: '10-in-1 / Graphite',
      });

      const quote = await pricing.quote([
        { productId: 'prod-1', quantity: 1, variantId: 'var-1' },
      ]);

      expect(quote.items[0].unitPrice).toBe(149);
      expect(quote.items[0].variantLabel).toBe('10-in-1 / Graphite');
      expect(quote.subtotal).toBe(149);
    });

    it('falls back to the product price when the variant has none', async () => {
      givenProduct({ hasVariants: true, price: money(80) });
      givenVariant({ price: null, stock: 5 });

      const quote = await pricing.quote([
        { productId: 'prod-1', quantity: 1, variantId: 'var-1' },
      ]);
      expect(quote.items[0].unitPrice).toBe(80);
    });

    it('checks the variant stock rather than the product stock', async () => {
      givenProduct({ hasVariants: true, stock: 999 });
      givenVariant({ stock: 1 });
      await expect(
        pricing.quote([
          { productId: 'prod-1', quantity: 2, variantId: 'var-1' },
        ]),
      ).rejects.toThrow(/Available: 1, Requested: 2/);
    });
  });

  describe('arithmetic', () => {
    it('multiplies unit price by quantity and sums the lines', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce(
          aProduct({ id: 'a', price: money(19.99), stock: 10 }) as never,
        )
        .mockResolvedValueOnce(
          aProduct({ id: 'b', price: money(5.05), stock: 10 }) as never,
        );

      const quote = await pricing.quote([
        { productId: 'a', quantity: 3 },
        { productId: 'b', quantity: 2 },
      ]);

      expect(quote.items[0].lineTotal).toBe(59.97);
      expect(quote.items[1].lineTotal).toBe(10.1);
      expect(quote.subtotal).toBe(70.07);
    });

    it('keeps cents exact where floating point would drift', async () => {
      givenProduct({ price: money(0.1), stock: 100 });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 3 }]);
      // 0.1 * 3 is 0.30000000000000004 in IEEE 754.
      expect(quote.subtotal).toBe(0.3);
    });

    it('taxes the discounted subtotal, not the gross subtotal', async () => {
      givenProduct({ price: money(200), stock: 10 });
      givenCoupon({ type: DiscountType.FIXED, value: money(50) });

      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'SAVE',
      );

      expect(quote.subtotal).toBe(200);
      expect(quote.discountAmount).toBe(50);
      expect(quote.taxAmount).toBe(12); // 150 * 0.08
      expect(quote.total).toBe(162); // 150 + 0 shipping + 12
    });

    it('total is discounted subtotal plus shipping plus tax', async () => {
      givenProduct({ price: money(50), stock: 10 });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 1 }]);

      expect(quote.shippingFee).toBe(9.99);
      expect(quote.taxAmount).toBe(4);
      expect(quote.total).toBe(63.99);
    });
  });

  describe('free shipping', () => {
    it('charges shipping below the threshold', async () => {
      givenProduct({ price: money(99.99), stock: 10 });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 1 }]);
      expect(quote.shippingFee).toBe(9.99);
      expect(quote.amountToFreeShipping).toBe(0.01);
    });

    it('is free at exactly the threshold', async () => {
      givenProduct({ price: money(100), stock: 10 });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 1 }]);
      expect(quote.shippingFee).toBe(0);
      expect(quote.amountToFreeShipping).toBe(0);
    });

    it('measures the gap against the discounted subtotal, so a coupon can cost you free shipping', async () => {
      givenProduct({ price: money(110), stock: 10 });
      givenCoupon({ type: DiscountType.FIXED, value: money(20) });

      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'SAVE',
      );

      expect(quote.subtotal).toBe(110);
      expect(quote.shippingFee).toBe(9.99);
      expect(quote.amountToFreeShipping).toBe(10);
    });

    it('honours an overridden threshold', async () => {
      process.env.FREE_SHIPPING_THRESHOLD = '50';
      givenProduct({ price: money(60), stock: 10 });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 1 }]);
      expect(quote.shippingFee).toBe(0);
    });
  });

  describe('coupons', () => {
    it('takes a percentage off', async () => {
      givenProduct({ price: money(200), stock: 10 });
      givenCoupon({ type: DiscountType.PERCENT, value: money(15) });

      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'SAVE15',
      );
      expect(quote.discountAmount).toBe(30);
    });

    it('takes a flat amount off', async () => {
      givenProduct({ price: money(200), stock: 10 });
      givenCoupon({ type: DiscountType.FIXED, value: money(25) });

      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'FLAT',
      );
      expect(quote.discountAmount).toBe(25);
    });

    it('caps a percentage discount at maxDiscount', async () => {
      givenProduct({ price: money(1000), stock: 10 });
      givenCoupon({
        type: DiscountType.PERCENT,
        value: money(50),
        maxDiscount: money(100),
      });

      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'HALF',
      );
      expect(quote.discountAmount).toBe(100);
    });

    it('never discounts more than the basket is worth', async () => {
      givenProduct({ price: money(10), stock: 10 });
      givenCoupon({ type: DiscountType.FIXED, value: money(500) });

      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'HUGE',
      );
      expect(quote.discountAmount).toBe(10);
      expect(quote.total).toBeGreaterThanOrEqual(0);
    });

    it('normalises the code before looking it up', async () => {
      givenProduct({ price: money(200), stock: 10 });
      givenCoupon();
      await pricing.quote([{ productId: 'prod-1', quantity: 1 }], '  save10  ');
      expect(prisma.coupon.findUnique).toHaveBeenCalledWith({
        where: { code: 'SAVE10' },
      });
    });

    it.each([
      ['unknown', null],
      ['deactivated', aCoupon({ isActive: false })],
      ['not started yet', aCoupon({ startsAt: new Date('2999-01-01') })],
      ['expired', aCoupon({ expiresAt: new Date('2000-01-01') })],
    ])('rejects a %s code', async (_label, coupon) => {
      givenProduct({ price: money(200), stock: 10 });
      prisma.coupon.findUnique.mockResolvedValue(coupon as never);
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 1 }], 'CODE'),
      ).rejects.toThrow('This promo code is not valid');
    });

    it('rejects a code that has been fully redeemed', async () => {
      givenProduct({ price: money(200), stock: 10 });
      givenCoupon({ maxUses: 5, usedCount: 5 });
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 1 }], 'CODE'),
      ).rejects.toThrow('This promo code has been fully redeemed');
    });

    it('allows the final redemption', async () => {
      givenProduct({ price: money(200), stock: 10 });
      givenCoupon({ maxUses: 5, usedCount: 4 });
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 1 }], 'CODE'),
      ).resolves.toBeDefined();
    });

    it('enforces the minimum spend', async () => {
      givenProduct({ price: money(30), stock: 10 });
      givenCoupon({ minOrderAmount: money(50) });
      await expect(
        pricing.quote([{ productId: 'prod-1', quantity: 1 }], 'CODE'),
      ).rejects.toThrow('Spend at least $50.00 to use this code');
    });

    it('accepts a basket exactly on the minimum spend', async () => {
      givenProduct({ price: money(50), stock: 10 });
      givenCoupon({
        minOrderAmount: money(50),
        type: DiscountType.FIXED,
        value: money(5),
      });
      const quote = await pricing.quote(
        [{ productId: 'prod-1', quantity: 1 }],
        'CODE',
      );
      expect(quote.discountAmount).toBe(5);
    });

    it('leaves the basket untouched when no code is given', async () => {
      givenProduct({ price: money(200), stock: 10 });
      const quote = await pricing.quote([{ productId: 'prod-1', quantity: 1 }]);
      expect(quote.coupon).toBeNull();
      expect(quote.discountAmount).toBe(0);
      expect(prisma.coupon.findUnique).not.toHaveBeenCalled();
    });
  });

  it('prices through a supplied transaction client rather than the default', async () => {
    const tx = createPrismaMock();
    tx.product.findUnique.mockResolvedValue(
      aProduct({ price: money(10), stock: 5 }) as never,
    );

    await pricing.quote(
      [{ productId: 'prod-1', quantity: 1 }],
      undefined,
      tx as never,
    );

    expect(tx.product.findUnique).toHaveBeenCalled();
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });
});
