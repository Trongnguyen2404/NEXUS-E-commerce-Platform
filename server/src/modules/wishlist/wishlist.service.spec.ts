import { NotFoundException } from '@nestjs/common';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import type { ReviewsService } from '@/modules/reviews/reviews.service';
import { PrismaService } from '@/prisma/prisma.service';
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

const AT = new Date('2026-01-01T00:00:00.000Z');

// A wishlist row the way Prisma returns it, with the product and its relations.
const aSavedItem = (
  productOver: Record<string, unknown> = {},
  variants: Record<string, unknown>[] = [],
) => {
  const product = aProduct(productOver);
  return {
    id: `wl-${product.id}`,
    userId: 'user-1',
    productId: product.id,
    createdAt: AT,
    product: { ...product, category: aCategory(), variants },
  };
};

describe('WishlistService', () => {
  let prisma: PrismaMock;
  let reviews: { summariseMany: jest.Mock };
  let wishlist: WishlistService;

  beforeEach(() => {
    prisma = createPrismaMock();
    reviews = { summariseMany: jest.fn().mockResolvedValue(new Map()) };
    wishlist = new WishlistService(
      prisma as unknown as PrismaService,
      reviews as unknown as ReviewsService,
    );
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  describe('findAll', () => {
    it('returns nothing for a user who has saved no products', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([] as never);

      await expect(wishlist.findAll('user-1')).resolves.toEqual({
        data: [],
        total: 0,
      });
    });

    it('reads only the calling user saved products, most recently saved first', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([] as never);

      await wishlist.findAll('user-7');

      expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-7' },
        orderBy: { createdAt: 'desc' },
        include: { product: { include: { category: true, variants: true } } },
      });
    });

    it('returns the saved products in the order the database gave them, with a total', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ id: 'prod-2', name: 'Nexus Keyboard' }),
        aSavedItem({ id: 'prod-1', name: 'Nexus Headphones' }),
      ] as never);

      const result = await wishlist.findAll('user-1');

      expect(result.data.map((product) => product.name)).toEqual([
        'Nexus Keyboard',
        'Nexus Headphones',
      ]);
      expect(result.total).toBe(2);
    });

    it('asks the review service about exactly the saved products', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ id: 'prod-2' }),
        aSavedItem({ id: 'prod-9' }),
      ] as never);

      await wishlist.findAll('user-1');

      expect(reviews.summariseMany).toHaveBeenCalledWith(['prod-2', 'prod-9']);
    });

    it('carries the average rating and review count through onto each product', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ id: 'prod-1' }),
      ] as never);
      reviews.summariseMany.mockResolvedValue(
        new Map([['prod-1', { average: 4.3, total: 27 }]]),
      );

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].rating).toBe(4.3);
      expect(data[0].reviewCount).toBe(27);
    });

    it('reports a zero rating for a saved product nobody has reviewed', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ id: 'prod-1' }),
      ] as never);
      reviews.summariseMany.mockResolvedValue(new Map());

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].rating).toBe(0);
      expect(data[0].reviewCount).toBe(0);
    });

    it('returns the stored decimal price as a plain number', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ price: money(49.5), stock: 12 }),
      ] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].price).toBe(49.5);
      expect(data[0].stock).toBe(12);
    });

    it('names the category rather than nesting the whole record', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([aSavedItem()] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].category).toBe('Audio');
    });

    it('lists the cover image, and an empty gallery when the product has none', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ id: 'prod-1', imageUrl: 'https://cdn.test/hp.webp' }),
        aSavedItem({ id: 'prod-2', imageUrl: null }),
      ] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].images).toEqual(['https://cdn.test/hp.webp']);
      expect(data[1].images).toEqual([]);
    });

    it('prices a variant product from its cheapest active variant', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ hasVariants: true, price: money(100) }, [
          aVariant({ id: 'var-1', price: money(120), stock: 3 }),
          aVariant({ id: 'var-2', price: money(95), stock: 2 }),
          aVariant({
            id: 'var-3',
            price: money(50),
            stock: 7,
            isActive: false,
          }),
        ]),
      ] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].price).toBe(95);
    });

    it('adds up the stock of the active variants only', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ hasVariants: true, stock: 999 }, [
          aVariant({ id: 'var-1', stock: 3 }),
          aVariant({ id: 'var-2', stock: 2 }),
          aVariant({ id: 'var-3', stock: 7, isActive: false }),
        ]),
      ] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].stock).toBe(5);
    });

    it('falls back to the product price for a variant that has no price of its own', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ hasVariants: true, price: money(80) }, [
          aVariant({ price: null, stock: 4 }),
        ]),
      ] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].price).toBe(80);
      expect(data[0].variants[0].price).toBe(80);
    });

    it('falls back to the product price and no stock when every variant is inactive', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        aSavedItem({ hasVariants: true, price: money(100), stock: 999 }, [
          aVariant({ price: money(60), stock: 7, isActive: false }),
        ]),
      ] as never);

      const { data } = await wishlist.findAll('user-1');

      expect(data[0].price).toBe(100);
      expect(data[0].stock).toBe(0);
    });
  });

  describe('add', () => {
    it('refuses to save a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(wishlist.add('user-1', 'ghost')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled();
    });

    it('says the product was not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(wishlist.add('user-1', 'ghost')).rejects.toThrow(
        'Product not found',
      );
    });

    it('saves the product and reports it as being in the wishlist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' } as never);

      await expect(wishlist.add('user-1', 'prod-1')).resolves.toEqual({
        message: 'Added to your wishlist',
        inWishlist: true,
      });
    });

    it('saving the same product twice still leaves a single entry', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' } as never);

      await wishlist.add('user-1', 'prod-1');
      const second = await wishlist.add('user-1', 'prod-1');

      expect(second.inWishlist).toBe(true);
      // The upsert keys on (user, product) and changes nothing on a repeat save.
      expect(prisma.wishlistItem.upsert).toHaveBeenCalledWith({
        where: { userId_productId: { userId: 'user-1', productId: 'prod-1' } },
        update: {},
        create: { userId: 'user-1', productId: 'prod-1' },
      });
      expect(prisma.wishlistItem.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('remove', () => {
    it('reports the product as no longer in the wishlist', async () => {
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 1 } as never);

      await expect(wishlist.remove('user-1', 'prod-1')).resolves.toEqual({
        message: 'Removed from your wishlist',
        inWishlist: false,
      });
    });

    it('deletes only the calling user entry for that product', async () => {
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 1 } as never);

      await wishlist.remove('user-1', 'prod-1');

      expect(prisma.wishlistItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', productId: 'prod-1' },
      });
    });

    it('treats removing a product that was never saved as a success', async () => {
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 0 } as never);

      await expect(wishlist.remove('user-1', 'prod-1')).resolves.toEqual({
        message: 'Removed from your wishlist',
        inWishlist: false,
      });
    });
  });

  describe('toggle', () => {
    it('saves a product that was not in the wishlist and reports it as saved', async () => {
      prisma.wishlistItem.findUnique.mockResolvedValue(null as never);
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' } as never);

      await expect(wishlist.toggle('user-1', 'prod-1')).resolves.toEqual({
        message: 'Added to your wishlist',
        inWishlist: true,
      });
      expect(prisma.wishlistItem.upsert).toHaveBeenCalled();
    });

    it('removes a product that was already saved and reports it as gone', async () => {
      prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'wl-1' } as never);
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 1 } as never);

      await expect(wishlist.toggle('user-1', 'prod-1')).resolves.toEqual({
        message: 'Removed from your wishlist',
        inWishlist: false,
      });
      expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled();
    });

    it('checks the saved state on the calling user own entry', async () => {
      prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'wl-1' } as never);
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 1 } as never);

      await wishlist.toggle('user-1', 'prod-1');

      expect(prisma.wishlistItem.findUnique).toHaveBeenCalledWith({
        where: { userId_productId: { userId: 'user-1', productId: 'prod-1' } },
        select: { id: true },
      });
    });

    it('refuses to toggle on a product that does not exist', async () => {
      prisma.wishlistItem.findUnique.mockResolvedValue(null as never);
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(wishlist.toggle('user-1', 'ghost')).rejects.toThrow(
        'Product not found',
      );
    });
  });
});
