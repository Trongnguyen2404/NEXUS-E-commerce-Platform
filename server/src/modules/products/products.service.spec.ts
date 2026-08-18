import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from '@/modules/products/products.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import {
  aCategory,
  aProduct,
  aVariant,
  money,
} from '@/common/testing/factories';
import type { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import type {
  ProductSort,
  QueryProductDto,
} from '@/modules/products/dto/query-product.dto';

describe('ProductsService', () => {
  let prisma: PrismaMock;
  let summariseMany: jest.Mock;
  let products: ProductsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    summariseMany = jest.fn().mockResolvedValue(new Map());
    products = new ProductsService(
      prisma as unknown as PrismaService,
      {
        summariseMany,
      } as unknown as ReviewsService,
    );
  });

  afterEach(() => {
    resetPrismaMock(prisma);
    jest.clearAllMocks();
  });

  type Over = Record<string, unknown>;

  // A product row shaped the way the service's queries return it: the category
  // joined and the variants included.
  const aRow = (over: Over = {}) => {
    const { category, variants, images, ...columns } = over;
    return {
      ...aProduct(columns),
      category: category ?? aCategory(),
      variants: variants ?? [],
      ...(images === undefined ? {} : { images }),
    };
  };

  const aQuery = (over: Partial<QueryProductDto> = {}): QueryProductDto =>
    ({ sort: 'newest', page: 1, limit: 10, ...over }) as QueryProductDto;

  const givenPage = (
    rows: unknown[],
    bounds: {
      total?: number;
      min?: Prisma.Decimal | null;
      max?: Prisma.Decimal | null;
    } = {},
  ) => {
    prisma.product.count.mockResolvedValue(
      (bounds.total ?? rows.length) as never,
    );
    prisma.product.findMany.mockResolvedValue(rows as never);
    prisma.product.aggregate.mockResolvedValue({
      _min: { price: bounds.min === undefined ? money(10) : bounds.min },
      _max: { price: bounds.max === undefined ? money(200) : bounds.max },
    } as never);
  };

  const listArgs = () =>
    prisma.product.findMany.mock
      .calls[0][0] as unknown as Prisma.ProductFindManyArgs;

  const listWhere = () => listArgs().where ?? {};

  // The price facet is built from its own where clause, so tests can tell the
  // two apart.
  const facetWhere = () =>
    (
      prisma.product.aggregate.mock
        .calls[0][0] as unknown as Prisma.ProductAggregateArgs
    ).where ?? {};

  // The two shapes the listing filters on: the base columns for a plain
  // product, the active variants for one that sells in variants.
  const inStockOr = [
    { hasVariants: false, stock: { gt: 0 } },
    {
      hasVariants: true,
      variants: { some: { isActive: true, stock: { gt: 0 } } },
    },
  ];

  const priceOr = (range: { gte?: number; lte?: number }) => [
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

  describe('create', () => {
    const dto: CreateProductDto = {
      name: 'Nexus Headphones',
      price: 99.99,
      stock: 5,
      sku: 'NX-HP',
      categoryId: 'cat-1',
    };

    it('returns the new product with its category name and no reviews yet', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);
      prisma.product.create.mockResolvedValue(
        aRow({ price: money(99.99), stock: 5 }) as never,
      );

      const created = await products.create(dto);

      expect(created.name).toBe('Nexus Headphones');
      expect(created.price).toBe(99.99);
      expect(created.stock).toBe(5);
      expect(created.category).toBe('Audio');
      expect(created.rating).toBe(0);
      expect(created.reviewCount).toBe(0);
      expect(created.variants).toEqual([]);
    });

    it('refuses a SKU another product already uses', async () => {
      prisma.product.findUnique.mockResolvedValue(aProduct() as never);

      await expect(products.create(dto)).rejects.toThrow(ConflictException);
      await expect(products.create(dto)).rejects.toThrow(
        'Product with SKU NX-HP already exist',
      );
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('writes the price as a Decimal so cents survive the round trip', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);
      prisma.product.create.mockResolvedValue(
        aRow({ price: money(99.99) }) as never,
      );

      await products.create(dto);

      const { data } = prisma.product.create.mock.calls[0][0] as unknown as {
        data: { price: Prisma.Decimal };
      };
      expect(data.price).toBeInstanceOf(Prisma.Decimal);
      expect(data.price.toString()).toBe('99.99');
    });
  });

  describe('findAll filtering', () => {
    it('lists only active products when the query says nothing about it', async () => {
      givenPage([]);
      await products.findAll(aQuery());
      expect(listWhere().isActive).toBe(true);
    });

    it('lists hidden products when an admin explicitly asks for isActive false', async () => {
      givenPage([]);
      await products.findAll(aQuery({ isActive: false }), true);
      expect(listWhere().isActive).toBe(false);
    });

    it('ignores isActive=false from a caller who is not an admin', async () => {
      givenPage([]);
      await products.findAll(aQuery({ isActive: false }));

      expect(listWhere().isActive).toBe(true);
      expect(facetWhere().isActive).toBe(true);
    });

    it('still defaults an admin listing to active products only', async () => {
      givenPage([]);
      await products.findAll(aQuery(), true);
      expect(listWhere().isActive).toBe(true);
    });

    it('requires every search word to appear in the name or the description', async () => {
      givenPage([]);
      await products.findAll(aQuery({ search: 'wireless mouse' }));

      expect(listWhere().AND).toEqual([
        {
          OR: [
            { name: { contains: 'wireless', mode: 'insensitive' } },
            { description: { contains: 'wireless', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { name: { contains: 'mouse', mode: 'insensitive' } },
            { description: { contains: 'mouse', mode: 'insensitive' } },
          ],
        },
      ]);
    });

    it('does not narrow by text when no search term is given', async () => {
      givenPage([]);
      await products.findAll(aQuery());
      expect(listWhere().AND).toBeUndefined();
    });

    it('matches a category given as an id, a name or a slug', async () => {
      givenPage([]);
      await products.findAll(aQuery({ category: 'audio' }));

      expect(listWhere().category).toEqual({
        OR: [
          { id: 'audio' },
          { name: { equals: 'audio', mode: 'insensitive' } },
          { slug: { equals: 'audio', mode: 'insensitive' } },
        ],
      });
    });

    it('applies both price bounds when both are given', async () => {
      givenPage([]);
      await products.findAll(aQuery({ minPrice: 50, maxPrice: 150 }));
      expect(listWhere().AND).toEqual([{ OR: priceOr({ gte: 50, lte: 150 }) }]);
    });

    it('applies a lower bound on its own', async () => {
      givenPage([]);
      await products.findAll(aQuery({ minPrice: 50 }));
      expect(listWhere().AND).toEqual([{ OR: priceOr({ gte: 50 }) }]);
    });

    it('treats a zero minimum price as a real bound rather than as absent', async () => {
      givenPage([]);
      await products.findAll(aQuery({ minPrice: 0 }));
      expect(listWhere().AND).toEqual([{ OR: priceOr({ gte: 0 }) }]);
    });

    it('leaves the price facet unfiltered so the slider keeps its full range', async () => {
      givenPage([]);
      await products.findAll(aQuery({ minPrice: 50, maxPrice: 150 }));

      expect(listWhere().AND).toEqual([{ OR: priceOr({ gte: 50, lte: 150 }) }]);
      expect(facetWhere().price).toBeUndefined();
      expect(facetWhere().AND).toBeUndefined();
      // Every other filter still shapes the facet.
      expect(facetWhere().isActive).toBe(true);
    });

    it('prices the range filter off the active variants, not the dead base column', async () => {
      givenPage([]);
      await products.findAll(aQuery({ minPrice: 100 }));

      // A base price of 10 must not decide the fate of a product whose
      // variants all cost 200 — the listing reports the variant price.
      expect(listWhere().price).toBeUndefined();
      expect(listWhere().AND).toEqual([
        {
          OR: expect.arrayContaining([
            {
              hasVariants: true,
              variants: { some: { isActive: true, price: { gte: 100 } } },
            },
          ]) as unknown,
        },
      ]);
    });

    it('hides sold-out products when inStock is asked for', async () => {
      givenPage([]);
      await products.findAll(aQuery({ inStock: true }));
      expect(listWhere().AND).toEqual([{ OR: inStockOr }]);
    });

    it('measures stock for a variant product on its active variants, not the dead base column', async () => {
      givenPage([]);
      await products.findAll(aQuery({ inStock: true }));

      // products.stock is never written once hasVariants is set, so filtering
      // it lists sold-out variant products as in stock.
      expect(listWhere().stock).toBeUndefined();
      expect(listWhere().AND).toEqual([
        {
          OR: expect.arrayContaining([
            {
              hasVariants: true,
              variants: { some: { isActive: true, stock: { gt: 0 } } },
            },
          ]) as unknown,
        },
      ]);
    });

    it('narrows on the search words and the stock filter at the same time', async () => {
      givenPage([]);
      await products.findAll(aQuery({ search: 'hoodie', inStock: true }));

      expect(listWhere().AND).toEqual([
        {
          OR: [
            { name: { contains: 'hoodie', mode: 'insensitive' } },
            { description: { contains: 'hoodie', mode: 'insensitive' } },
          ],
        },
        { OR: inStockOr },
      ]);
    });

    it('keeps every narrowing when a price range joins the search and stock filters', async () => {
      givenPage([]);
      await products.findAll(
        aQuery({ search: 'hoodie', inStock: true, maxPrice: 80 }),
      );

      expect(listWhere().AND).toEqual([
        {
          OR: [
            { name: { contains: 'hoodie', mode: 'insensitive' } },
            { description: { contains: 'hoodie', mode: 'insensitive' } },
          ],
        },
        { OR: inStockOr },
        { OR: priceOr({ lte: 80 }) },
      ]);
    });

    it('keeps sold-out products when inStock is not asked for', async () => {
      givenPage([]);
      await products.findAll(aQuery({ inStock: false }));
      expect(listWhere().stock).toBeUndefined();
      expect(listWhere().AND).toBeUndefined();
    });
  });

  describe('findAll paging', () => {
    it('skips whole pages and takes one page worth of rows', async () => {
      givenPage([], { total: 25 });
      await products.findAll(aQuery({ page: 3, limit: 10 }));

      expect(listArgs().skip).toBe(20);
      expect(listArgs().take).toBe(10);
    });

    it('starts at the first page of ten when the query omits paging', async () => {
      givenPage([]);
      await products.findAll({} as QueryProductDto);

      expect(listArgs().skip).toBe(0);
      expect(listArgs().take).toBe(10);
    });

    it('reports the total, the page and how many pages there are', async () => {
      givenPage([aRow()], { total: 25 });
      const { meta } = await products.findAll(aQuery({ page: 2, limit: 10 }));

      expect(meta.total).toBe(25);
      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(10);
      expect(meta.totalPages).toBe(3);
    });

    it('rounds a partial last page up to a whole page', async () => {
      givenPage([aRow()], { total: 11 });
      const { meta } = await products.findAll(aQuery({ limit: 10 }));
      expect(meta.totalPages).toBe(2);
    });

    it('reports no pages and no data when nothing matches', async () => {
      givenPage([], { total: 0, min: null, max: null });
      const { data, meta } = await products.findAll(aQuery());

      expect(data).toEqual([]);
      expect(meta.totalPages).toBe(0);
      expect(meta.priceRange).toEqual({ min: 0, max: 0 });
    });

    it('reports the cheapest and dearest price in the filtered set', async () => {
      givenPage([aRow()], { min: money(19.99), max: money(249.5) });
      const { meta } = await products.findAll(aQuery());
      expect(meta.priceRange).toEqual({ min: 19.99, max: 249.5 });
    });
  });

  describe('findAll sorting', () => {
    it.each([
      ['newest', { createdAt: 'desc' }],
      ['oldest', { createdAt: 'asc' }],
      ['price_asc', { price: 'asc' }],
      ['price_desc', { price: 'desc' }],
      ['name_asc', { name: 'asc' }],
      ['name_desc', { name: 'desc' }],
      ['popular', { reviews: { _count: 'desc' } }],
    ] as [ProductSort, Prisma.ProductOrderByWithRelationInput][])(
      'orders a %s listing by %p',
      async (sort, orderBy) => {
        givenPage([]);
        await products.findAll(aQuery({ sort }));
        expect(listArgs().orderBy).toEqual(orderBy);
      },
    );

    it('orders by newest first when the query omits the sort key', async () => {
      givenPage([]);
      await products.findAll({} as QueryProductDto);
      expect(listArgs().orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('findAll rating join', () => {
    it('looks the whole page of ratings up in a single call', async () => {
      givenPage([aRow({ id: 'a' }), aRow({ id: 'b' })]);
      await products.findAll(aQuery());

      expect(summariseMany).toHaveBeenCalledTimes(1);
      expect(summariseMany).toHaveBeenCalledWith(['a', 'b']);
    });

    it('gives each product its own average and review count', async () => {
      givenPage([aRow({ id: 'a' }), aRow({ id: 'b' })]);
      summariseMany.mockResolvedValue(
        new Map([
          ['a', { average: 4.5, total: 12 }],
          ['b', { average: 3, total: 2 }],
        ]),
      );

      const { data } = await products.findAll(aQuery());

      expect(data[0]).toMatchObject({ rating: 4.5, reviewCount: 12 });
      expect(data[1]).toMatchObject({ rating: 3, reviewCount: 2 });
    });

    it('reports a zero rating for a product nobody has reviewed', async () => {
      givenPage([aRow({ id: 'a' })]);
      summariseMany.mockResolvedValue(new Map());

      const { data } = await products.findAll(aQuery());

      expect(data[0].rating).toBe(0);
      expect(data[0].reviewCount).toBe(0);
    });

    it('exposes the cover image as the listing gallery', async () => {
      givenPage([aRow({ imageUrl: 'https://cdn.test/front.webp' })]);
      const { data } = await products.findAll(aQuery());
      expect(data[0].images).toEqual(['https://cdn.test/front.webp']);
    });

    it('exposes an empty gallery for a product with no cover image', async () => {
      givenPage([aRow({ imageUrl: null })]);
      const { data } = await products.findAll(aQuery());
      expect(data[0].images).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the gallery in stored order', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          images: [
            { url: 'https://cdn.test/front.webp', position: 0 },
            { url: 'https://cdn.test/back.webp', position: 1 },
          ],
        }) as never,
      );

      const product = await products.findOne('prod-1');

      expect(product.images).toEqual([
        'https://cdn.test/front.webp',
        'https://cdn.test/back.webp',
      ]);
    });

    it('throws when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);
      await expect(products.findOne('ghost')).rejects.toThrow(
        NotFoundException,
      );
      await expect(products.findOne('ghost')).rejects.toThrow(
        'Product not found',
      );
    });

    it('prices a variant product from its cheapest active variant', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: true,
          price: money(100),
          variants: [
            aVariant({ id: 'v1', price: money(149) }),
            aVariant({ id: 'v2', price: money(129) }),
          ],
        }) as never,
      );

      const product = await products.findOne('prod-1');
      expect(product.price).toBe(129);
    });

    it('ignores a deactivated variant when pricing', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: true,
          price: money(100),
          variants: [
            aVariant({ id: 'v1', price: money(149) }),
            aVariant({ id: 'v2', price: money(9), isActive: false }),
          ],
        }) as never,
      );

      const product = await products.findOne('prod-1');
      expect(product.price).toBe(149);
    });

    it('totals the stock of the active variants only', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: true,
          stock: 999,
          variants: [
            aVariant({ id: 'v1', stock: 4 }),
            aVariant({ id: 'v2', stock: 6 }),
            aVariant({ id: 'v3', stock: 50, isActive: false }),
          ],
        }) as never,
      );

      const product = await products.findOne('prod-1');
      expect(product.stock).toBe(10);
    });

    it('reports a variant product with every variant retired as out of stock', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: true,
          stock: 999,
          price: money(100),
          variants: [aVariant({ stock: 7, isActive: false })],
        }) as never,
      );

      const product = await products.findOne('prod-1');

      expect(product.stock).toBe(0);
      expect(product.price).toBe(100);
    });

    it('still lists a deactivated variant so an admin can see it', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: true,
          variants: [aVariant({ id: 'v1', isActive: false })],
        }) as never,
      );

      const product = await products.findOne('prod-1');

      expect(product.variants).toHaveLength(1);
      expect(product.variants[0].isActive).toBe(false);
    });

    it('quotes the product price for a variant that has no price of its own', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: true,
          price: money(80),
          variants: [aVariant({ price: null })],
        }) as never,
      );

      const product = await products.findOne('prod-1');
      expect(product.variants[0].price).toBe(80);
    });

    it('ignores variants on a product that does not sell in variants', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aRow({
          hasVariants: false,
          price: money(100),
          stock: 3,
          variants: [aVariant({ price: money(10), stock: 99 })],
        }) as never,
      );

      const product = await products.findOne('prod-1');

      expect(product.price).toBe(100);
      expect(product.stock).toBe(3);
    });
  });

  describe('setImages', () => {
    const givenProductThenReload = (reload: unknown) => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ id: 'prod-1' } as never)
        .mockResolvedValueOnce(reload as never);
    };

    it('replaces the whole gallery in one transaction', async () => {
      givenProductThenReload(aRow({ images: [] }));

      await products.setImages('prod-1', ['https://cdn.test/a.webp']);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.productImage.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
      });
    });

    it('numbers the images by the order they were sent', async () => {
      givenProductThenReload(aRow({ images: [] }));

      await products.setImages('prod-1', [
        'https://cdn.test/a.webp',
        'https://cdn.test/b.webp',
      ]);

      expect(prisma.productImage.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 'prod-1', url: 'https://cdn.test/a.webp', position: 0 },
          { productId: 'prod-1', url: 'https://cdn.test/b.webp', position: 1 },
        ],
      });
    });

    it('promotes the first image to the cover', async () => {
      givenProductThenReload(aRow({ images: [] }));

      await products.setImages('prod-1', [
        'https://cdn.test/a.webp',
        'https://cdn.test/b.webp',
      ]);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { imageUrl: 'https://cdn.test/a.webp' },
      });
    });

    it('clears the cover when the gallery is emptied', async () => {
      givenProductThenReload(aRow({ images: [], imageUrl: null }));

      await products.setImages('prod-1', []);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { imageUrl: null },
      });
    });

    it('returns the product with its new gallery', async () => {
      givenProductThenReload(
        aRow({
          imageUrl: 'https://cdn.test/a.webp',
          images: [{ url: 'https://cdn.test/a.webp', position: 0 }],
        }),
      );

      const product = await products.setImages('prod-1', [
        'https://cdn.test/a.webp',
      ]);

      expect(product.images).toEqual(['https://cdn.test/a.webp']);
    });

    it('refuses an unknown product without touching any images', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(
        products.setImages('ghost', ['https://cdn.test/a.webp']),
      ).rejects.toThrow('Product not found');
      expect(prisma.productImage.deleteMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('returns the product with the new values applied', async () => {
      prisma.product.findUnique.mockResolvedValue(aProduct() as never);
      prisma.product.update.mockResolvedValue(
        aRow({ name: 'Nexus Headphones Pro', stock: 42 }) as never,
      );

      const updated = await products.update('prod-1', {
        name: 'Nexus Headphones Pro',
        stock: 42,
      });

      expect(updated.name).toBe('Nexus Headphones Pro');
      expect(updated.stock).toBe(42);
    });

    it('throws when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(products.update('ghost', { name: 'X' })).rejects.toThrow(
        'Product not found',
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('refuses a SKU that belongs to another product', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce(aProduct({ sku: 'NX-HP' }) as never)
        .mockResolvedValueOnce(
          aProduct({ id: 'other', sku: 'NX-XX' }) as never,
        );

      await expect(products.update('prod-1', { sku: 'NX-XX' })).rejects.toThrow(
        'Product with SKU NX-XX already exists',
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('accepts an update that resubmits the product its own SKU', async () => {
      prisma.product.findUnique.mockResolvedValue(
        aProduct({ sku: 'NX-HP' }) as never,
      );
      prisma.product.update.mockResolvedValue(aRow() as never);

      await expect(
        products.update('prod-1', { sku: 'NX-HP', stock: 1 }),
      ).resolves.toBeDefined();
      // Only the product itself was looked up; no clash check was needed.
      expect(prisma.product.findUnique).toHaveBeenCalledTimes(1);
    });

    it('accepts a SKU that no other product holds', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce(aProduct({ sku: 'NX-HP' }) as never)
        .mockResolvedValueOnce(null as never);
      prisma.product.update.mockResolvedValue(aRow({ sku: 'NX-NEW' }) as never);

      const updated = await products.update('prod-1', { sku: 'NX-NEW' });
      expect(updated.sku).toBe('NX-NEW');
    });

    it('writes a new price as a Decimal', async () => {
      prisma.product.findUnique.mockResolvedValue(aProduct() as never);
      prisma.product.update.mockResolvedValue(
        aRow({ price: money(12.34) }) as never,
      );

      const updated = await products.update('prod-1', { price: 12.34 });

      const { data } = prisma.product.update.mock.calls[0][0] as unknown as {
        data: { price: Prisma.Decimal };
      };
      expect(data.price).toBeInstanceOf(Prisma.Decimal);
      expect(data.price.toString()).toBe('12.34');
      expect(updated.price).toBe(12.34);
    });

    it('leaves the price untouched when the update does not mention it', async () => {
      prisma.product.findUnique.mockResolvedValue(aProduct() as never);
      prisma.product.update.mockResolvedValue(aRow() as never);

      await products.update('prod-1', { stock: 7 });

      const { data } = prisma.product.update.mock.calls[0][0] as unknown as {
        data: Record<string, unknown>;
      };
      expect(data).toEqual({ stock: 7 });
    });

    it('attaches the current rating to the updated product', async () => {
      prisma.product.findUnique.mockResolvedValue(aProduct() as never);
      prisma.product.update.mockResolvedValue(aRow() as never);
      summariseMany.mockResolvedValue(
        new Map([['prod-1', { average: 4.2, total: 9 }]]),
      );

      const updated = await products.update('prod-1', { stock: 7 });

      expect(updated.rating).toBe(4.2);
      expect(updated.reviewCount).toBe(9);
    });
  });

  describe('updateStock', () => {
    const givenStockWriteHits = (count: number) => {
      prisma.product.updateMany.mockResolvedValue({ count } as never);
    };

    it('adds the given quantity to the shelf', async () => {
      givenStockWriteHits(1);
      prisma.product.findUnique.mockResolvedValue(aRow({ stock: 15 }) as never);

      const product = await products.updateStock('prod-1', 5);

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 5 } },
      });
      expect(product.stock).toBe(15);
    });

    it('takes stock off the shelf for a negative quantity', async () => {
      givenStockWriteHits(1);
      prisma.product.findUnique.mockResolvedValue(aRow({ stock: 7 }) as never);

      const product = await products.updateStock('prod-1', -3);

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', stock: { gte: 3 } },
        data: { stock: { increment: -3 } },
      });
      expect(product.stock).toBe(7);
    });

    it('guards a subtraction so stock can never fall below zero', async () => {
      givenStockWriteHits(0);
      prisma.product.findUnique.mockResolvedValue(
        aProduct({ stock: 2 }) as never,
      );

      await expect(products.updateStock('prod-1', -3)).rejects.toThrow(
        BadRequestException,
      );
      await expect(products.updateStock('prod-1', -3)).rejects.toThrow(
        'Insufficient stock to perform this operation',
      );
    });

    it('allows taking exactly the last units in stock', async () => {
      givenStockWriteHits(1);
      prisma.product.findUnique.mockResolvedValue(aRow({ stock: 0 }) as never);

      const product = await products.updateStock('prod-1', -5);

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', stock: { gte: 5 } },
        data: { stock: { increment: -5 } },
      });
      expect(product.stock).toBe(0);
    });

    it('throws when subtracting from a product that does not exist', async () => {
      givenStockWriteHits(0);
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(products.updateStock('ghost', -1)).rejects.toThrow(
        NotFoundException,
      );
      await expect(products.updateStock('ghost', -1)).rejects.toThrow(
        'Product not found',
      );
    });

    it('throws when adding to a product that does not exist', async () => {
      givenStockWriteHits(0);

      await expect(products.updateStock('ghost', 5)).rejects.toThrow(
        'Product not found',
      );
    });
  });

  describe('remove', () => {
    it('deletes a product nobody has ever ordered', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct(),
        orderItems: [],
        cartItems: [],
      } as never);

      const result = await products.remove('prod-1');

      expect(result).toEqual({ message: 'Product deleted successfully' });
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      });
    });

    it('clears the product out of the carts holding it before deleting it', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct(),
        orderItems: [],
        cartItems: [{ id: 'ci-1' }, { id: 'ci-2' }],
      } as never);

      // CartItem.product restricts the delete, so leaving the lines behind
      // fails the delete with a foreign-key error, not a useful message.
      const result = await products.remove('prod-1');

      expect(result).toEqual({ message: 'Product deleted successfully' });
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
      });
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      });
    });

    it('leaves the cart alone when nobody is holding the product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct(),
        orderItems: [],
        cartItems: [],
      } as never);

      await products.remove('prod-1');

      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('keeps a product that appears on an order and says why', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...aProduct(),
        orderItems: [{ id: 'oi-1' }],
        cartItems: [],
      } as never);

      await expect(products.remove('prod-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(products.remove('prod-1')).rejects.toThrow(
        /Consider marking it as inactive only/,
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('throws when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(products.remove('ghost')).rejects.toThrow(
        'Product not found',
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });
  });
});
