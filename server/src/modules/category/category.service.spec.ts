import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CategoryService } from '@/modules/category/category.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { aCategory } from '@/common/testing/factories';
import { QueryCategoryDto } from '@/modules/category/dto/query-category.dto';

describe('CategoryService', () => {
  let prisma: PrismaMock;
  let categories: CategoryService;

  beforeEach(() => {
    prisma = createPrismaMock();
    categories = new CategoryService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  // A row as Prisma hands it back when the query includes the product count.
  const withCount = (products: number, over: Record<string, unknown> = {}) => ({
    ...aCategory(over),
    _count: { products },
  });

  const query = (over: Partial<QueryCategoryDto> = {}) =>
    over as QueryCategoryDto;

  // The response is built from the row the database wrote, so echo it back.
  const echoOnCreate = () => {
    prisma.category.create.mockImplementation(((args: {
      data: Record<string, unknown>;
    }) => Promise.resolve(aCategory(args.data))) as never);
  };

  const givenPage = (rows: unknown[], total = rows.length) => {
    prisma.category.count.mockResolvedValue(total as never);
    prisma.category.findMany.mockResolvedValue(rows as never);
  };

  describe('create', () => {
    it('derives a lowercase hyphenated slug from the name', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await categories.create({ name: 'Home Audio' });

      expect(created.slug).toBe('home-audio');
      expect(created.name).toBe('Home Audio');
    });

    it('collapses a run of spaces in the name into a single hyphen', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await categories.create({ name: 'Home   Audio' });

      expect(created.slug).toBe('home-audio');
    });

    it('leaves nothing but URL-safe characters in a derived slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await categories.create({ name: 'Toys & Games!' });

      expect(created.slug).toMatch(/^[a-z0-9_-]+$/);
    });

    it('keeps a slug the caller supplied instead of deriving one', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await categories.create({
        name: 'Home Audio',
        slug: 'hifi',
      });

      expect(created.slug).toBe('hifi');
    });

    it('carries the optional fields through to the new category', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await categories.create({
        name: 'Home Audio',
        description: 'Speakers and amps',
        imageUrl: 'https://cdn.test/audio.png',
        isActive: false,
      });

      expect(created).toMatchObject({
        description: 'Speakers and amps',
        imageUrl: 'https://cdn.test/audio.png',
        isActive: false,
      });
    });

    it('rejects a second category whose name yields a slug already in use', async () => {
      prisma.category.findUnique.mockResolvedValue(aCategory() as never);

      await expect(categories.create({ name: 'Audio' })).rejects.toThrow(
        ConflictException,
      );
      await expect(categories.create({ name: 'Audio' })).rejects.toThrow(
        'Category with this slug already exists: audio',
      );
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('checks for the clash using the derived slug, not the raw name', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      await categories.create({ name: 'Home Audio' });

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { slug: 'home-audio' },
      });
    });

    it('reports a product count of zero for a brand-new category', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await categories.create({ name: 'Home Audio' });

      expect(created.productCount).toBe(0);
    });
  });

  describe('findAll', () => {
    it('hides inactive categories when no filter is asked for', async () => {
      givenPage([withCount(0)]);

      await categories.findAll(query());

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('returns only the inactive ones when they are asked for', async () => {
      givenPage([withCount(0, { isActive: false })]);

      await categories.findAll(query({ isActive: false }));

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
    });

    it('counts the total against the same filter as the page', async () => {
      givenPage([withCount(0)], 1);

      await categories.findAll(query({ isActive: false }));

      expect(prisma.category.count).toHaveBeenCalledWith({
        where: { isActive: false },
      });
    });

    it('reports the number of live products beside each category', async () => {
      givenPage([withCount(7, { id: 'cat-1' }), withCount(0, { id: 'cat-2' })]);

      const { data } = await categories.findAll(query());

      expect(data.map((category) => category.productCount)).toEqual([7, 0]);
    });

    it('searches the name and the description case-insensitively', async () => {
      givenPage([]);

      await categories.findAll(query({ search: 'audio' }));

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            OR: [
              { name: { contains: 'audio', mode: 'insensitive' } },
              { description: { contains: 'audio', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('defaults to the first page of ten', async () => {
      givenPage([]);

      const { meta } = await categories.findAll(query());

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(meta).toMatchObject({ page: 1, limit: 10 });
    });

    it('skips the pages before the one asked for', async () => {
      givenPage([], 45);

      await categories.findAll(query({ page: 3, limit: 15 }));

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 30, take: 15 }),
      );
    });

    it('rounds the page count up when the last page is partial', async () => {
      givenPage([withCount(0)], 25);

      const { meta } = await categories.findAll(query({ limit: 10 }));

      expect(meta.totalPages).toBe(3);
    });

    it('returns an empty page and no pages at all when nothing matches', async () => {
      givenPage([], 0);

      const { data, meta } = await categories.findAll(query());

      expect(data).toEqual([]);
      expect(meta).toEqual({ total: 0, page: 1, limit: 10, totalPages: 0 });
    });

    it('lists the newest category first', async () => {
      givenPage([]);

      await categories.findAll(query());

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the category with its live product count', async () => {
      prisma.category.findUnique.mockResolvedValue(
        withCount(4, { name: 'Audio' }) as never,
      );

      const category = await categories.findOne('cat-1');

      expect(category).toMatchObject({
        id: 'cat-1',
        name: 'Audio',
        slug: 'audio',
        productCount: 4,
      });
    });

    it('refuses an id that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);

      await expect(categories.findOne('ghost')).rejects.toThrow(
        NotFoundException,
      );
      await expect(categories.findOne('ghost')).rejects.toThrow(
        'Category not found',
      );
    });
  });

  describe('findBySlug', () => {
    it('looks the category up by its slug rather than its id', async () => {
      prisma.category.findUnique.mockResolvedValue(withCount(2) as never);

      const category = await categories.findBySlug('audio');

      expect(category.productCount).toBe(2);
      expect(prisma.category.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'audio' } }),
      );
    });

    it('refuses a slug that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);

      await expect(categories.findBySlug('ghost')).rejects.toThrow(
        'Category not found',
      );
    });
  });

  describe('update', () => {
    it('refuses to update a category that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);

      await expect(
        categories.update('ghost', { name: 'Audio' }),
      ).rejects.toThrow('Category not found');
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('returns the edited category with its live product count', async () => {
      prisma.category.findUnique.mockResolvedValue(aCategory() as never);
      prisma.category.update.mockResolvedValue(
        withCount(5, { name: 'Studio Audio' }) as never,
      );

      const updated = await categories.update('cat-1', {
        name: 'Studio Audio',
      });

      expect(updated.name).toBe('Studio Audio');
      expect(updated.productCount).toBe(5);
    });

    it('rejects a slug another category already owns', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(aCategory({ slug: 'audio' }) as never)
        .mockResolvedValueOnce(
          aCategory({ id: 'cat-2', slug: 'hifi' }) as never,
        );

      await expect(
        categories.update('cat-1', { slug: 'hifi' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('names the clashing slug in the rejection', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(aCategory({ slug: 'audio' }) as never)
        .mockResolvedValueOnce(
          aCategory({ id: 'cat-2', slug: 'hifi' }) as never,
        );

      await expect(
        categories.update('cat-1', { slug: 'hifi' }),
      ).rejects.toThrow('Category with slug hifi already exists');
    });

    it('accepts a free slug that no other category holds', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(aCategory({ slug: 'audio' }) as never)
        .mockResolvedValueOnce(null as never);
      prisma.category.update.mockResolvedValue(
        withCount(0, { slug: 'hifi' }) as never,
      );

      const updated = await categories.update('cat-1', { slug: 'hifi' });

      expect(updated.slug).toBe('hifi');
    });

    it('does not run a clash check when the slug is resubmitted unchanged', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(
        aCategory({ slug: 'audio' }) as never,
      );
      prisma.category.update.mockResolvedValue(withCount(0) as never);

      await categories.update('cat-1', { slug: 'audio', isActive: false });

      expect(prisma.category.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.category.update).toHaveBeenCalled();
    });

    it('takes a category offline without touching its other fields', async () => {
      prisma.category.findUnique.mockResolvedValue(aCategory() as never);
      prisma.category.update.mockResolvedValue(
        withCount(3, { isActive: false }) as never,
      );

      const updated = await categories.update('cat-1', { isActive: false });

      expect(updated.isActive).toBe(false);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: { isActive: false },
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes a category no product points at', async () => {
      prisma.category.findUnique.mockResolvedValue(withCount(0) as never);

      const result = await categories.remove('cat-1');

      expect(result).toEqual({ message: 'Category delete successfully' });
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });

    it('refuses while products still reference the category', async () => {
      prisma.category.findUnique.mockResolvedValue(withCount(3) as never);

      await expect(categories.remove('cat-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(categories.remove('cat-1')).rejects.toThrow(
        'Cannot delete category with 3 products. Remove or reassign first',
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('blocks the delete on the last remaining product', async () => {
      prisma.category.findUnique.mockResolvedValue(withCount(1) as never);

      await expect(categories.remove('cat-1')).rejects.toThrow(
        'Cannot delete category with 1 products. Remove or reassign first',
      );
    });

    it('weighs every product, not just the live ones, before deleting', async () => {
      prisma.category.findUnique.mockResolvedValue(withCount(0) as never);

      await categories.remove('cat-1');

      // An inactive product still holds the foreign key, so the count is unfiltered.
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { _count: { select: { products: true } } },
      });
    });

    it('refuses an id that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null as never);

      await expect(categories.remove('ghost')).rejects.toThrow(
        'Category not found',
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });
});
