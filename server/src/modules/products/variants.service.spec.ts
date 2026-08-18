import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VariantsService } from '@/modules/products/variants.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { aProduct, aVariant, money } from '@/common/testing/factories';
import type {
  CreateVariantDto,
  UpdateVariantDto,
} from '@/modules/products/dto/variant.dto';

describe('VariantsService', () => {
  let prisma: PrismaMock;
  let variants: VariantsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    variants = new VariantsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  const aCreateDto = (over: Partial<CreateVariantDto> = {}): CreateVariantDto =>
    ({
      sku: 'TS-M-BLK',
      options: { Size: 'M', Color: 'Black' },
      stock: 25,
      ...over,
    }) as CreateVariantDto;

  // The row shape `remove` reads: the variant plus how often it has been sold.
  const aSoldVariant = (
    soldTimes: number,
    over: Record<string, unknown> = {},
  ) =>
    ({
      ...aVariant(over),
      _count: { orderItems: soldTimes },
    }) as never;

  const createdVariant = () =>
    prisma.productVariant.create.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>;
    };

  const updatedVariant = () =>
    prisma.productVariant.update.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>;
    };

  describe('labelFor', () => {
    it('joins the option values with a slash', () => {
      expect(VariantsService.labelFor({ Size: 'M', Color: 'Black' })).toBe(
        'M / Black',
      );
    });

    it('renders a single option as the value on its own', () => {
      expect(VariantsService.labelFor({ Color: 'Black' })).toBe('Black');
    });

    it('reads the options in the order they were written', () => {
      expect(VariantsService.labelFor({ Color: 'Black', Size: 'M' })).toBe(
        'Black / M',
      );
    });

    it('trims the whitespace around each value', () => {
      expect(
        VariantsService.labelFor({ Size: '  M  ', Color: ' Black ' }),
      ).toBe('M / Black');
    });

    it('skips an option whose value is blank', () => {
      expect(VariantsService.labelFor({ Size: '   ', Color: 'Black' })).toBe(
        'Black',
      );
    });

    it('rejects options with nothing in them', () => {
      expect(() => VariantsService.labelFor({})).toThrow(BadRequestException);
      expect(() => VariantsService.labelFor({})).toThrow(
        'Options must contain at least one value',
      );
    });

    it('rejects options whose every value is blank', () => {
      expect(() => VariantsService.labelFor({ Size: ' ', Color: '' })).toThrow(
        'Options must contain at least one value',
      );
    });
  });

  describe('findAll', () => {
    it('lists the variants of a product with their own prices', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct({ hasVariants: true }),
        variants: [
          aVariant({ id: 'v1', label: 'M / Black', price: money(24.99) }),
          aVariant({ id: 'v2', label: 'L / Black', price: money(26.5) }),
        ],
      } as never);

      const list = await variants.findAll('prod-1');

      expect(list.map((variant) => variant.label)).toEqual([
        'M / Black',
        'L / Black',
      ]);
      expect(list.map((variant) => variant.price)).toEqual([24.99, 26.5]);
    });

    it('quotes the product price for a variant that has none of its own', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct({ hasVariants: true, price: money(80) }),
        variants: [aVariant({ price: null })],
      } as never);

      const list = await variants.findAll('prod-1');
      expect(list[0].price).toBe(80);
    });

    it('returns an empty list for a product that has no variants', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct(),
        variants: [],
      } as never);

      await expect(variants.findAll('prod-1')).resolves.toEqual([]);
    });

    it('throws when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(variants.findAll('ghost')).rejects.toThrow(
        NotFoundException,
      );
      await expect(variants.findAll('ghost')).rejects.toThrow(
        'Product not found',
      );
    });
  });

  describe('create', () => {
    const givenProduct = (over: Record<string, unknown> = {}) => {
      const product = aProduct(over);
      prisma.product.findUnique.mockResolvedValue(product as never);
      prisma.productVariant.findUnique.mockResolvedValue(null as never);
      return product;
    };

    it('stores the SKU trimmed and upper-cased', async () => {
      givenProduct();
      prisma.productVariant.create.mockResolvedValue(aVariant() as never);

      await variants.create('prod-1', aCreateDto({ sku: '  ts-m-blk  ' }));

      expect(createdVariant().data.sku).toBe('TS-M-BLK');
    });

    it('checks the normalised SKU for a clash before creating anything', async () => {
      prisma.product.findUnique.mockResolvedValue(aProduct() as never);
      prisma.productVariant.findUnique.mockResolvedValue(aVariant() as never);

      await expect(
        variants.create('prod-1', aCreateDto({ sku: ' ts-m-blk ' })),
      ).rejects.toThrow(ConflictException);
      await expect(
        variants.create('prod-1', aCreateDto({ sku: ' ts-m-blk ' })),
      ).rejects.toThrow('A variant with SKU TS-M-BLK already exists');

      expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
        where: { sku: 'TS-M-BLK' },
      });
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('labels the variant from its options', async () => {
      givenProduct();
      prisma.productVariant.create.mockResolvedValue(
        aVariant({ label: 'M / Black' }) as never,
      );

      const created = await variants.create(
        'prod-1',
        aCreateDto({ options: { Size: 'M', Color: 'Black' } }),
      );

      expect(createdVariant().data.label).toBe('M / Black');
      expect(created.label).toBe('M / Black');
    });

    it('marks the product as selling in variants once it has its first', async () => {
      givenProduct({ hasVariants: false });
      prisma.productVariant.create.mockResolvedValue(aVariant() as never);

      await variants.create('prod-1', aCreateDto());

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { hasVariants: true },
      });
    });

    it('leaves a product that already sells in variants untouched', async () => {
      givenProduct({ hasVariants: true });
      prisma.productVariant.create.mockResolvedValue(aVariant() as never);

      await variants.create('prod-1', aCreateDto());

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('creates the variant and flips the flag in a single transaction', async () => {
      givenProduct({ hasVariants: false });
      prisma.productVariant.create.mockResolvedValue(aVariant() as never);

      await variants.create('prod-1', aCreateDto());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('inherits the product price when the variant is given none', async () => {
      givenProduct({ price: money(80) });
      prisma.productVariant.create.mockResolvedValue(
        aVariant({ price: null }) as never,
      );

      const created = await variants.create('prod-1', aCreateDto());

      expect(createdVariant().data.price).toBeNull();
      expect(created.price).toBe(80);
    });

    it('keeps a price of its own when one is given', async () => {
      givenProduct({ price: money(80) });
      prisma.productVariant.create.mockResolvedValue(
        aVariant({ price: money(24.99) }) as never,
      );

      const created = await variants.create(
        'prod-1',
        aCreateDto({ price: 24.99 }),
      );

      expect(created.price).toBe(24.99);
    });

    it('creates the variant active unless told otherwise', async () => {
      givenProduct();
      prisma.productVariant.create.mockResolvedValue(aVariant() as never);

      await variants.create('prod-1', aCreateDto());

      expect(createdVariant().data.isActive).toBe(true);
    });

    it('honours a variant created deactivated', async () => {
      givenProduct();
      prisma.productVariant.create.mockResolvedValue(
        aVariant({ isActive: false }) as never,
      );

      await variants.create('prod-1', aCreateDto({ isActive: false }));

      expect(createdVariant().data.isActive).toBe(false);
    });

    it('accepts a variant that starts out of stock', async () => {
      givenProduct();
      prisma.productVariant.create.mockResolvedValue(
        aVariant({ stock: 0 }) as never,
      );

      const created = await variants.create('prod-1', aCreateDto({ stock: 0 }));

      expect(createdVariant().data.stock).toBe(0);
      expect(created.stock).toBe(0);
    });

    it('refuses options with no values and creates nothing', async () => {
      givenProduct();

      await expect(
        variants.create('prod-1', aCreateDto({ options: {} })),
      ).rejects.toThrow('Options must contain at least one value');
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('throws when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(variants.create('ghost', aCreateDto())).rejects.toThrow(
        'Product not found',
      );
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const givenVariant = (over: Record<string, unknown> = {}) => {
      const product = aProduct({ hasVariants: true, price: money(80) });
      prisma.productVariant.findUnique.mockResolvedValueOnce({
        ...aVariant(over),
        product,
      } as never);
      return product;
    };

    it('throws when the variant does not exist', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(null as never);

      await expect(variants.update('ghost', { stock: 1 })).rejects.toThrow(
        NotFoundException,
      );
      await expect(variants.update('ghost', { stock: 1 })).rejects.toThrow(
        'Variant not found',
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('refuses a SKU another variant already holds', async () => {
      givenVariant({ sku: 'TS-M-BLK' });
      prisma.productVariant.findUnique.mockResolvedValueOnce(
        aVariant({ id: 'other', sku: 'TS-L-BLK' }) as never,
      );

      await expect(
        variants.update('var-1', { sku: 'ts-l-blk' }),
      ).rejects.toThrow('A variant with SKU TS-L-BLK already exists');
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('accepts the variant resubmitting its own SKU', async () => {
      givenVariant({ sku: 'TS-M-BLK' });
      prisma.productVariant.update.mockResolvedValue(aVariant() as never);

      await expect(
        variants.update('var-1', { sku: 'ts-m-blk' }),
      ).resolves.toBeDefined();
      // Only the variant itself was read; no clash check was needed.
      expect(prisma.productVariant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('normalises a new SKU before saving it', async () => {
      givenVariant({ sku: 'TS-M-BLK' });
      prisma.productVariant.findUnique.mockResolvedValueOnce(null as never);
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ sku: 'TS-L-BLK' }) as never,
      );

      await variants.update('var-1', { sku: '  ts-l-blk  ' });

      expect(updatedVariant().data.sku).toBe('TS-L-BLK');
    });

    it('re-labels the variant when its options change', async () => {
      givenVariant({ label: 'M / Black' });
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ label: 'L / Red' }) as never,
      );

      const updated = await variants.update('var-1', {
        options: { Size: 'L', Color: 'Red' },
      });

      expect(updatedVariant().data.label).toBe('L / Red');
      expect(updated.label).toBe('L / Red');
    });

    it('refuses to blank a variant label by emptying its options', async () => {
      givenVariant();

      await expect(variants.update('var-1', { options: {} })).rejects.toThrow(
        'Options must contain at least one value',
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('writes only the fields the request mentions', async () => {
      givenVariant();
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ stock: 3 }) as never,
      );

      await variants.update('var-1', { stock: 3 });

      expect(updatedVariant().data).toEqual({ stock: 3 });
    });

    it('records a stock of zero rather than reading it as absent', async () => {
      givenVariant();
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ stock: 0 }) as never,
      );

      const updated = await variants.update('var-1', { stock: 0 });

      expect(updatedVariant().data).toEqual({ stock: 0 });
      expect(updated.stock).toBe(0);
    });

    it('returns the product price once the variant price override is cleared', async () => {
      givenVariant();
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ price: null }) as never,
      );

      const updated = await variants.update('var-1', {
        price: null,
      } as unknown as UpdateVariantDto);

      expect(updatedVariant().data).toEqual({ price: null });
      expect(updated.price).toBe(80);
    });

    it('returns the new price when the override is changed', async () => {
      givenVariant();
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ price: money(31.5) }) as never,
      );

      const updated = await variants.update('var-1', { price: 31.5 });
      expect(updated.price).toBe(31.5);
    });

    it('can retire a variant without deleting it', async () => {
      givenVariant();
      prisma.productVariant.update.mockResolvedValue(
        aVariant({ isActive: false }) as never,
      );

      const updated = await variants.update('var-1', { isActive: false });

      expect(updatedVariant().data).toEqual({ isActive: false });
      expect(updated.isActive).toBe(false);
    });
  });

  describe('remove', () => {
    it('deletes a variant that has never been sold', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(aSoldVariant(0));
      prisma.productVariant.count.mockResolvedValue(2 as never);

      const result = await variants.remove('var-1');

      expect(result).toEqual({ message: 'Variant deleted' });
      expect(prisma.productVariant.delete).toHaveBeenCalledWith({
        where: { id: 'var-1' },
      });
    });

    it('stops the product selling in variants once the last one is gone', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(aSoldVariant(0));
      prisma.productVariant.count.mockResolvedValue(0 as never);

      await variants.remove('var-1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { hasVariants: false },
      });
    });

    it('keeps the product selling in variants while siblings remain', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(aSoldVariant(0));
      prisma.productVariant.count.mockResolvedValue(1 as never);

      await variants.remove('var-1');

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('counts only the siblings of the variant being deleted', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(
        aSoldVariant(0, { productId: 'prod-9' }),
      );
      prisma.productVariant.count.mockResolvedValue(0 as never);

      await variants.remove('var-1');

      expect(prisma.productVariant.count).toHaveBeenCalledWith({
        where: { productId: 'prod-9' },
      });
    });

    it('deactivates a variant that has been sold instead of deleting it', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(
        aSoldVariant(3, { label: 'M / Black' }),
      );

      const result = await variants.remove('var-1');

      expect(result.message).toBe(
        'M / Black has been sold 3 time(s), so it was deactivated rather than deleted',
      );
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { isActive: false },
      });
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });

    it('throws when the variant does not exist', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(null as never);

      await expect(variants.remove('ghost')).rejects.toThrow(NotFoundException);
      await expect(variants.remove('ghost')).rejects.toThrow(
        'Variant not found',
      );
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });
  });
});
