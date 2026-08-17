import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Review, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateReviewDto } from '@/modules/reviews/dto/create-review.dto';
import { QueryReviewsDto } from '@/modules/reviews/dto/query-reviews.dto';
import {
  PaginatedReviewsDto,
  ReviewResponseDto,
  ReviewSummaryDto,
} from '@/modules/reviews/dto/review-response.dto';

/** Orders that count as "actually received the product". */
const FULFILLED_STATUSES: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates or replaces the caller's review for a product.
   *
   * Upsert rather than create: the unique constraint is (userId, productId), so
   * a second POST is the user editing their mind, not an error.
   */
  async upsert(
    userId: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const isVerifiedPurchase = await this.hasPurchased(userId, productId);

    const review = await this.prisma.review.upsert({
      where: { userId_productId: { userId, productId } },
      update: {
        rating: dto.rating,
        title: dto.title ?? null,
        comment: dto.comment ?? null,
        isVerifiedPurchase,
      },
      create: {
        userId,
        productId,
        rating: dto.rating,
        title: dto.title ?? null,
        comment: dto.comment ?? null,
        isVerifiedPurchase,
      },
      include: { user: true },
    });

    return this.map(review);
  }

  async findByProduct(
    productId: string,
    query: QueryReviewsDto,
  ): Promise<PaginatedReviewsDto> {
    const { page = 1, limit = 10, rating, sort = 'newest' } = query;

    const where: Prisma.ReviewWhereInput = { productId };
    if (rating) where.rating = rating;

    const orderBy: Prisma.ReviewOrderByWithRelationInput =
      sort === 'highest'
        ? { rating: 'desc' }
        : sort === 'lowest'
          ? { rating: 'asc' }
          : { createdAt: 'desc' };

    const [reviews, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: true },
      }),
      this.prisma.review.count({ where }),
      // Summary covers every review for the product, not just the current
      // filter — otherwise filtering by 1 star would report an average of 1.
      this.summarise(productId),
    ]);

    return {
      data: reviews.map((review) => this.map(review)),
      summary,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** The caller's own review, so the UI can pre-fill the edit form. */
  async findMine(
    userId: string,
    productId: string,
  ): Promise<ReviewResponseDto | null> {
    const review = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
      include: { user: true },
    });

    return review ? this.map(review) : null;
  }

  async remove(
    id: string,
    userId: string,
    role: Role,
  ): Promise<{ message: string }> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    // Admins moderate; everyone else may only delete their own.
    if (review.userId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('You can only delete your own review');
    }

    await this.prisma.review.delete({ where: { id } });
    return { message: 'Review deleted' };
  }

  /** Ratings for many products at once, for product listings. */
  async summariseMany(
    productIds: string[],
  ): Promise<Map<string, { average: number; total: number }>> {
    if (productIds.length === 0) return new Map();

    const grouped = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return new Map(
      grouped.map((row) => [
        row.productId,
        {
          average: Math.round((row._avg.rating ?? 0) * 10) / 10,
          total: row._count.rating,
        },
      ]),
    );
  }

  private async summarise(productId: string): Promise<ReviewSummaryDto> {
    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId },
      _count: { rating: true },
    });

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let total = 0;
    let weighted = 0;

    for (const row of grouped) {
      const count = row._count.rating;
      distribution[row.rating] = count;
      total += count;
      weighted += row.rating * count;
    }

    return {
      average: total === 0 ? 0 : Math.round((weighted / total) * 10) / 10,
      total,
      distribution,
    };
  }

  /** Did this user ever receive this product in a fulfilled order? */
  private async hasPurchased(
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const count = await this.prisma.orderItem.count({
      where: {
        productId,
        order: { userId, status: { in: FULFILLED_STATUSES } },
      },
    });

    return count > 0;
  }

  private map(review: Review & { user: User }): ReviewResponseDto {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      isVerifiedPurchase: review.isVerifiedPurchase,
      productId: review.productId,
      userId: review.userId,
      authorName: this.displayName(review.user),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  /**
   * "John D." rather than the full name or the email. Reviews are public, so
   * publishing an email address here would leak it to scrapers.
   */
  private displayName(user: User): string {
    const first = user.firstName?.trim();
    const lastInitial = user.lastName?.trim()?.[0];

    if (first && lastInitial) return `${first} ${lastInitial}.`;
    if (first) return first;

    return 'Verified customer';
  }
}
