import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateReviewDto } from '@/modules/reviews/dto/create-review.dto';
import { QueryReviewsDto } from '@/modules/reviews/dto/query-reviews.dto';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { aProduct, aUser } from '@/common/testing/factories';

const AT = new Date('2026-01-01T00:00:00.000Z');

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  userId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
  user: ReturnType<typeof aUser>;
};

// Local fixture: a stored review joined to its author, the row the service maps from.
const aReview = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: 'rev-1',
  rating: 5,
  title: 'Great sound for the price',
  comment: 'Wore them all week.',
  isVerifiedPurchase: false,
  userId: 'user-1',
  productId: 'prod-1',
  createdAt: AT,
  updatedAt: AT,
  user: aUser(),
  ...over,
});

type UpsertArgs = {
  where: { userId_productId: { userId: string; productId: string } };
  create: Partial<ReviewRow>;
  update: Partial<ReviewRow>;
};

type PurchaseCountArgs = {
  where: {
    productId: string;
    order: { userId: string; status: { in: OrderStatus[] } };
  };
};

describe('ReviewsService', () => {
  let prisma: PrismaMock;
  let reviews: ReviewsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    reviews = new ReviewsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  const givenProduct = (over: Record<string, unknown> = {}) => {
    const product = aProduct(over);
    prisma.product.findUnique.mockResolvedValue(product as never);
    return product;
  };

  const givenFulfilledOrderItems = (count: number) => {
    prisma.orderItem.count.mockResolvedValue(count as never);
  };

  // Stands in for the (userId, productId) unique key, so a repeat post has to
  // land on the row already there instead of creating a second one.
  const givenReviewTable = () => {
    const rows = new Map<string, ReviewRow>();

    (prisma.review.upsert as unknown as jest.Mock).mockImplementation(
      (args: UpsertArgs) => {
        const { userId, productId } = args.where.userId_productId;
        const key = `${userId}::${productId}`;
        const existing = rows.get(key);
        const row = existing
          ? { ...existing, ...args.update }
          : aReview({
              id: `rev-${rows.size + 1}`,
              user: aUser({ id: userId }),
              ...args.create,
            });

        rows.set(key, row);
        return Promise.resolve(row);
      },
    );

    return rows;
  };

  const input = (over: Partial<CreateReviewDto> = {}): CreateReviewDto =>
    ({ rating: 5, ...over }) as CreateReviewDto;

  const query = (over: Partial<QueryReviewsDto> = {}): QueryReviewsDto =>
    over as QueryReviewsDto;

  const givenPageOfReviews = (
    rows: ReviewRow[],
    stars: Array<{ rating: number; count: number }> = [],
    total = rows.length,
  ) => {
    prisma.review.findMany.mockResolvedValue(rows as never);
    prisma.review.count.mockResolvedValue(total as never);
    prisma.review.groupBy.mockResolvedValue(
      stars.map((star) => ({
        rating: star.rating,
        _count: { rating: star.count },
      })) as never,
    );
  };

  describe('upsert', () => {
    it('refuses a review for a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(reviews.upsert('user-1', 'ghost', input())).rejects.toThrow(
        NotFoundException,
      );
      await expect(reviews.upsert('user-1', 'ghost', input())).rejects.toThrow(
        'Product not found',
      );
      expect(prisma.review.upsert).not.toHaveBeenCalled();
    });

    it('replaces the reviewer own earlier review instead of adding a second one', async () => {
      givenProduct();
      givenFulfilledOrderItems(0);
      const table = givenReviewTable();

      const first = await reviews.upsert(
        'user-1',
        'prod-1',
        input({ rating: 2, title: 'Disappointing', comment: 'Rattles.' }),
      );
      const second = await reviews.upsert(
        'user-1',
        'prod-1',
        input({
          rating: 5,
          title: 'Grew on me',
          comment: 'Firmware fixed it.',
        }),
      );

      expect(table.size).toBe(1);
      expect(second.id).toBe(first.id);
      expect(second.rating).toBe(5);
      expect(second.title).toBe('Grew on me');
      expect(second.comment).toBe('Firmware fixed it.');
    });

    it('gives a second shopper their own review of the same product', async () => {
      givenProduct();
      givenFulfilledOrderItems(0);
      const table = givenReviewTable();

      await reviews.upsert('user-1', 'prod-1', input({ rating: 5 }));
      await reviews.upsert('user-2', 'prod-1', input({ rating: 1 }));

      expect(table.size).toBe(2);
    });

    it('returns the saved review shaped for the API', async () => {
      givenProduct();
      givenFulfilledOrderItems(0);
      prisma.review.upsert.mockResolvedValue(
        aReview({
          id: 'rev-9',
          rating: 4,
          title: 'Solid',
          comment: 'Good value.',
        }) as never,
      );

      const saved = await reviews.upsert('user-1', 'prod-1', input());

      expect(saved).toEqual({
        id: 'rev-9',
        rating: 4,
        title: 'Solid',
        comment: 'Good value.',
        isVerifiedPurchase: false,
        productId: 'prod-1',
        userId: 'user-1',
        authorName: 'Lan P.',
        createdAt: AT,
        updatedAt: AT,
      });
    });

    it('stores an omitted title and comment as null rather than undefined', async () => {
      givenProduct();
      givenFulfilledOrderItems(0);
      givenReviewTable();

      const saved = await reviews.upsert(
        'user-1',
        'prod-1',
        input({ rating: 3 }),
      );

      expect(saved.title).toBeNull();
      expect(saved.comment).toBeNull();
      expect(saved.rating).toBe(3);
    });

    it('flags the review as a verified purchase when a settled order contains the product', async () => {
      givenProduct();
      givenFulfilledOrderItems(1);
      givenReviewTable();

      const saved = await reviews.upsert('user-1', 'prod-1', input());

      expect(saved.isVerifiedPurchase).toBe(true);
    });

    it('leaves the verified flag off when the reviewer never bought the product', async () => {
      givenProduct();
      givenFulfilledOrderItems(0);
      givenReviewTable();

      const saved = await reviews.upsert('user-1', 'prod-1', input());

      expect(saved.isVerifiedPurchase).toBe(false);
    });

    it('looks for the purchase only in the reviewer own orders for that product', async () => {
      givenProduct();
      givenFulfilledOrderItems(0);
      givenReviewTable();

      await reviews.upsert('user-1', 'prod-1', input());

      const [args] = prisma.orderItem.count.mock.calls[0] as unknown as [
        PurchaseCountArgs,
      ];
      expect(args.where.productId).toBe('prod-1');
      expect(args.where.order.userId).toBe('user-1');
      // A basket that was never paid for, or was cancelled, must not earn the badge.
      expect(args.where.order.status.in).toContain(OrderStatus.DELIVERED);
      expect(args.where.order.status.in).not.toContain(OrderStatus.PENDING);
      expect(args.where.order.status.in).not.toContain(OrderStatus.CANCELLED);
    });

    it('awards the badge on a later edit once the purchase has gone through', async () => {
      givenProduct();
      givenReviewTable();

      prisma.orderItem.count.mockResolvedValueOnce(0 as never);
      const before = await reviews.upsert(
        'user-1',
        'prod-1',
        input({ rating: 4 }),
      );

      prisma.orderItem.count.mockResolvedValueOnce(1 as never);
      const after = await reviews.upsert(
        'user-1',
        'prod-1',
        input({ rating: 5 }),
      );

      expect(before.isVerifiedPurchase).toBe(false);
      expect(after.isVerifiedPurchase).toBe(true);
    });
  });

  describe('findByProduct', () => {
    it('returns the page of reviews together with the product summary', async () => {
      givenPageOfReviews(
        [
          aReview({ id: 'rev-1', rating: 5 }),
          aReview({ id: 'rev-2', rating: 4 }),
        ],
        [
          { rating: 4, count: 1 },
          { rating: 5, count: 1 },
        ],
      );

      const page = await reviews.findByProduct('prod-1', query());

      expect(page.data.map((review) => review.id)).toEqual(['rev-1', 'rev-2']);
      expect(page.summary.total).toBe(2);
      expect(page.summary.average).toBe(4.5);
      expect(page.total).toBe(2);
    });

    it('shows the first ten reviews when no paging is asked for', async () => {
      givenPageOfReviews([], [], 0);

      const page = await reviews.findByProduct('prod-1', query());

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(page.page).toBe(1);
      expect(page.limit).toBe(10);
    });

    it('skips the pages before the one asked for', async () => {
      givenPageOfReviews([], [], 40);

      const page = await reviews.findByProduct(
        'prod-1',
        query({ page: 3, limit: 5 }),
      );

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
      expect(page.page).toBe(3);
      expect(page.limit).toBe(5);
    });

    it('counts a partial last page as a whole page', async () => {
      givenPageOfReviews([], [], 23);

      const page = await reviews.findByProduct('prod-1', query({ limit: 10 }));

      expect(page.totalPages).toBe(3);
    });

    it('returns an empty page and a zeroed summary for a product nobody has reviewed', async () => {
      givenPageOfReviews([], [], 0);

      const page = await reviews.findByProduct('prod-1', query());

      expect(page.data).toEqual([]);
      expect(page.total).toBe(0);
      expect(page.totalPages).toBe(0);
      expect(page.summary).toEqual({
        average: 0,
        total: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    });

    it('narrows the list to a single star rating when one is requested', async () => {
      givenPageOfReviews(
        [aReview({ rating: 4 })],
        [{ rating: 4, count: 1 }],
        1,
      );

      await reviews.findByProduct('prod-1', query({ rating: 4 }));

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: 'prod-1', rating: 4 } }),
      );
      expect(prisma.review.count).toHaveBeenCalledWith({
        where: { productId: 'prod-1', rating: 4 },
      });
    });

    it('still summarises every star while the list is filtered to one', async () => {
      givenPageOfReviews(
        [aReview({ rating: 4 })],
        [
          { rating: 1, count: 2 },
          { rating: 4, count: 1 },
        ],
        1,
      );

      const page = await reviews.findByProduct('prod-1', query({ rating: 4 }));

      expect(prisma.review.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: 'prod-1' } }),
      );
      expect(page.total).toBe(1);
      expect(page.summary.total).toBe(3);
    });

    it('lists the newest reviews first by default', async () => {
      givenPageOfReviews([], [], 0);

      await reviews.findByProduct('prod-1', query());

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('lists the best ratings first when sorting by highest', async () => {
      givenPageOfReviews([], [], 0);

      await reviews.findByProduct('prod-1', query({ sort: 'highest' }));

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { rating: 'desc' } }),
      );
    });

    it('lists the worst ratings first when sorting by lowest', async () => {
      givenPageOfReviews([], [], 0);

      await reviews.findByProduct('prod-1', query({ sort: 'lowest' }));

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { rating: 'asc' } }),
      );
    });
  });

  describe('summary', () => {
    it('rounds the average rating to one decimal place', async () => {
      // 5 + 5 + 4 over three reviews is 4.666...
      givenPageOfReviews(
        [],
        [
          { rating: 4, count: 1 },
          { rating: 5, count: 2 },
        ],
        3,
      );

      const page = await reviews.findByProduct('prod-1', query());

      expect(page.summary.average).toBe(4.7);
    });

    it('rounds a half star upwards', async () => {
      // 5 + 4 + 4 + 4 over four reviews is exactly 4.25.
      givenPageOfReviews(
        [],
        [
          { rating: 4, count: 3 },
          { rating: 5, count: 1 },
        ],
        4,
      );

      const page = await reviews.findByProduct('prod-1', query());

      expect(page.summary.average).toBe(4.3);
    });

    it('reports a zero count for every star nobody awarded', async () => {
      givenPageOfReviews(
        [],
        [
          { rating: 3, count: 2 },
          { rating: 5, count: 7 },
        ],
        9,
      );

      const page = await reviews.findByProduct('prod-1', query());

      expect(page.summary.distribution).toEqual({
        1: 0,
        2: 0,
        3: 2,
        4: 0,
        5: 7,
      });
      expect(page.summary.total).toBe(9);
    });

    it('reports an average of five when every review is five stars', async () => {
      givenPageOfReviews([], [{ rating: 5, count: 4 }], 4);

      const page = await reviews.findByProduct('prod-1', query());

      expect(page.summary.average).toBe(5);
      expect(page.summary.distribution[5]).toBe(4);
    });
  });

  describe('findMine', () => {
    it('returns the caller own review of the product', async () => {
      prisma.review.findUnique.mockResolvedValue(
        aReview({ id: 'rev-7', rating: 3 }) as never,
      );

      const mine = await reviews.findMine('user-1', 'prod-1');

      expect(mine?.id).toBe('rev-7');
      expect(mine?.rating).toBe(3);
      // The lookup is keyed on the caller, so it can never return someone else's review.
      expect(prisma.review.findUnique).toHaveBeenCalledWith({
        where: { userId_productId: { userId: 'user-1', productId: 'prod-1' } },
        include: { user: true },
      });
    });

    it('returns null when the caller has not reviewed the product yet', async () => {
      prisma.review.findUnique.mockResolvedValue(null as never);

      await expect(reviews.findMine('user-1', 'prod-1')).resolves.toBeNull();
    });
  });

  describe('remove', () => {
    it('lets the author delete their own review', async () => {
      prisma.review.findUnique.mockResolvedValue(
        aReview({ id: 'rev-1', userId: 'user-1' }) as never,
      );

      const result = await reviews.remove('rev-1', 'user-1', Role.USER);

      expect(result).toEqual({ message: 'Review deleted' });
      expect(prisma.review.delete).toHaveBeenCalledWith({
        where: { id: 'rev-1' },
      });
    });

    it('refuses to let one shopper delete a review written by another', async () => {
      prisma.review.findUnique.mockResolvedValue(
        aReview({ id: 'rev-1', userId: 'user-1' }) as never,
      );

      await expect(
        reviews.remove('rev-1', 'user-2', Role.USER),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        reviews.remove('rev-1', 'user-2', Role.USER),
      ).rejects.toThrow('You can only delete your own review');
      expect(prisma.review.delete).not.toHaveBeenCalled();
    });

    it('lets an admin delete a review written by someone else', async () => {
      prisma.review.findUnique.mockResolvedValue(
        aReview({ id: 'rev-1', userId: 'user-1' }) as never,
      );

      const result = await reviews.remove('rev-1', 'admin-1', Role.ADMIN);

      expect(result).toEqual({ message: 'Review deleted' });
      expect(prisma.review.delete).toHaveBeenCalledWith({
        where: { id: 'rev-1' },
      });
    });

    it('reports a review that does not exist as not found', async () => {
      prisma.review.findUnique.mockResolvedValue(null as never);

      await expect(
        reviews.remove('ghost', 'user-1', Role.USER),
      ).rejects.toThrow(NotFoundException);
      await expect(
        reviews.remove('ghost', 'user-1', Role.USER),
      ).rejects.toThrow('Review not found');
      expect(prisma.review.delete).not.toHaveBeenCalled();
    });
  });

  describe('summariseMany', () => {
    it('returns nothing and queries nothing for an empty list of products', async () => {
      const summaries = await reviews.summariseMany([]);

      expect(summaries.size).toBe(0);
      expect(prisma.review.groupBy).not.toHaveBeenCalled();
    });

    it('summarises several products in a single grouped query', async () => {
      prisma.review.groupBy.mockResolvedValue([
        { productId: 'prod-1', _avg: { rating: 4.5 }, _count: { rating: 2 } },
        { productId: 'prod-2', _avg: { rating: 3 }, _count: { rating: 1 } },
      ] as never);

      const summaries = await reviews.summariseMany(['prod-1', 'prod-2']);

      expect(prisma.review.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.review.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: { in: ['prod-1', 'prod-2'] } },
        }),
      );
      expect(summaries.get('prod-1')).toEqual({ average: 4.5, total: 2 });
      expect(summaries.get('prod-2')).toEqual({ average: 3, total: 1 });
    });

    it('rounds each product average to one decimal place', async () => {
      prisma.review.groupBy.mockResolvedValue([
        {
          productId: 'prod-1',
          _avg: { rating: 4.666666666666667 },
          _count: { rating: 3 },
        },
      ] as never);

      const summaries = await reviews.summariseMany(['prod-1']);

      expect(summaries.get('prod-1')?.average).toBe(4.7);
    });

    it('leaves out products that nobody has reviewed', async () => {
      prisma.review.groupBy.mockResolvedValue([
        { productId: 'prod-1', _avg: { rating: 5 }, _count: { rating: 1 } },
      ] as never);

      const summaries = await reviews.summariseMany([
        'prod-1',
        'prod-2',
        'prod-3',
      ]);

      expect(summaries.size).toBe(1);
      expect(summaries.has('prod-2')).toBe(false);
      expect(summaries.get('prod-2')).toBeUndefined();
    });
  });

  describe('reviewer display name', () => {
    const authorNameFor = async (over: Record<string, unknown>) => {
      prisma.review.findUnique.mockResolvedValue(
        aReview({ user: aUser(over) }) as never,
      );
      const mine = await reviews.findMine('user-1', 'prod-1');
      return mine?.authorName;
    };

    it('shows the first name and only the initial of the surname', async () => {
      await expect(
        authorNameFor({ firstName: 'Lan', lastName: 'Pham' }),
      ).resolves.toBe('Lan P.');
    });

    it('shows the first name alone when there is no surname', async () => {
      await expect(
        authorNameFor({ firstName: 'Lan', lastName: null }),
      ).resolves.toBe('Lan');
    });

    it('treats a surname of only spaces as no surname', async () => {
      await expect(
        authorNameFor({ firstName: 'Lan', lastName: '   ' }),
      ).resolves.toBe('Lan');
    });

    it('trims the stored names before building the display name', async () => {
      await expect(
        authorNameFor({ firstName: '  Lan  ', lastName: '  Pham  ' }),
      ).resolves.toBe('Lan P.');
    });

    it('calls a reviewer with no first name a verified customer', async () => {
      await expect(
        authorNameFor({ firstName: null, lastName: 'Pham' }),
      ).resolves.toBe('Verified customer');
    });

    it('calls a reviewer whose first name is only spaces a verified customer', async () => {
      await expect(
        authorNameFor({ firstName: '   ', lastName: 'Pham' }),
      ).resolves.toBe('Verified customer');
    });

    it('never puts the reviewer email or password hash in the response', async () => {
      prisma.review.findUnique.mockResolvedValue(
        aReview({ user: aUser({ email: 'buyer@nexus.test' }) }) as never,
      );

      const mine = await reviews.findMine('user-1', 'prod-1');

      expect(mine).not.toBeNull();
      const serialised = JSON.stringify(mine);
      expect(serialised).not.toContain('buyer@nexus.test');
      expect(serialised).not.toContain('password');
    });
  });

  // Star bounds live on the DTO rather than the service, so they are checked here.
  describe('rating bounds on the review body', () => {
    const messagesFor = (payload: Record<string, unknown>) =>
      validateSync(plainToInstance(CreateReviewDto, payload)).flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );

    it.each([1, 2, 3, 4, 5])('accepts a rating of %i star(s)', (rating) => {
      expect(messagesFor({ rating })).toEqual([]);
    });

    it.each([0, 6, -1, 99])('rejects a rating of %i', (rating) => {
      expect(messagesFor({ rating })).toContain(
        'Rating must be between 1 and 5',
      );
    });

    it('rejects half stars', () => {
      expect(messagesFor({ rating: 4.5 })).toContain(
        'Rating must be a whole number of stars',
      );
    });

    it('rejects a body with no rating at all', () => {
      expect(messagesFor({ comment: 'Nice' })).toContain(
        'Rating must be a whole number of stars',
      );
    });

    it('rejects a title longer than 120 characters', () => {
      expect(messagesFor({ rating: 5, title: 'x'.repeat(121) })).toContain(
        'Title must be 120 characters or fewer',
      );
    });

    it('accepts a title of exactly 120 characters', () => {
      expect(messagesFor({ rating: 5, title: 'x'.repeat(120) })).toEqual([]);
    });

    it('rejects a comment longer than 2000 characters', () => {
      expect(messagesFor({ rating: 5, comment: 'x'.repeat(2001) })).toContain(
        'Comment must be 2000 characters or fewer',
      );
    });
  });
});
