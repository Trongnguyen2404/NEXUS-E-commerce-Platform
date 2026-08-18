import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import {
  OrderApiResponseDto,
  OrderResponseDto,
} from '@/modules/orders/dto/order-response.dto';
import {
  Address,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Prisma,
  Product,
  User,
} from '@prisma/client';
import { PricingService } from '@/modules/pricing/pricing.service';
import { QueryOrderDto } from '@/modules/orders/dto/query-order.dto';
import { UpdateOrderDto } from '@/modules/orders/dto/update-order.dto';
import { UpdateOrderUserDto } from '@/modules/orders/dto/update-order-user.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from '@/modules/mail/mail.service';
import { orderStatusEmail } from '@/modules/mail/mail.templates';
import { frontendUrl } from '@/modules/auth/auth.constants';

// Order lifecycle: placing, listing, status changes, cancellation and stock.
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private pricingService: PricingService,
  ) {}

  // Flattens an address into the single line stored on the order.
  private formatAddress(address: Address): string {
    return [
      address.fullName,
      address.phone,
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  // Places an order: prices the basket, reserves stock and marks the cart checked out.
  async create(
    userId: string,
    createOrderDto: CreateOrderDto,
  ): Promise<OrderApiResponseDto<OrderResponseDto>> {
    const { items, shippingAddress, addressId, couponCode } = createOrderDto;

    const latestCart = await this.prisma.cart.findFirst({
      where: {
        userId,
        checkedOut: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let addressSnapshot = shippingAddress ?? null;
    if (addressId) {
      const address = await this.prisma.address.findFirst({
        where: { id: addressId, userId },
      });
      if (!address) throw new NotFoundException('Address not found');
      addressSnapshot = this.formatAddress(address);
    }

    if (!addressSnapshot) {
      throw new BadRequestException('A shipping address is required');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const quote = await this.pricingService.quote(items, couponCode, tx);

      for (const item of quote.items) {
        const claimed = item.variantId
          ? await tx.productVariant.updateMany({
              where: {
                id: item.variantId,
                stock: { gte: item.quantity },
              },
              data: {
                stock: { decrement: item.quantity },
              },
            })
          : await tx.product.updateMany({
              where: {
                id: item.productId,
                stock: { gte: item.quantity },
              },
              data: {
                stock: { decrement: item.quantity },
              },
            });

        if (claimed.count === 0) {
          const label = item.variantLabel
            ? `${item.productName} (${item.variantLabel})`
            : item.productName;
          throw new BadRequestException(
            `Product ${label} is out of stock due to concurrent purchases.`,
          );
        }
      }

      if (quote.coupon) {
        const claimed = await tx.$executeRaw`
                    UPDATE coupons
                    SET "usedCount" = "usedCount" + 1
                    WHERE id = ${quote.coupon.id}
                      AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
                `;

        if (claimed === 0) {
          throw new BadRequestException(
            'This promo code has just been fully redeemed',
          );
        }
      }

      const newOrder = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          subtotal: quote.subtotal,
          discountAmount: quote.discountAmount,
          shippingFee: quote.shippingFee,
          taxAmount: quote.taxAmount,
          totalAmount: quote.total,
          couponId: quote.coupon?.id ?? null,
          addressId: addressId ?? null,
          shippingAddress: addressSnapshot,
          cartId: latestCart?.id || null,
          orderItems: {
            create: quote.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              variantId: item.variantId,
              variantLabel: item.variantLabel,
              quantity: item.quantity,
              price: item.unitPrice,
            })),
          },
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: true,
          coupon: { select: { code: true } },
        },
      });

      if (latestCart) {
        await tx.cart.update({
          where: { id: latestCart.id },
          data: { checkedOut: true },
        });
      }

      return newOrder;
    });

    return this.wrap(order, 'Order placed successfully');
  }

  // Lists every order with paging, status and search filters.
  async findAllForAdmin(query: QueryOrderDto): Promise<{
    data: OrderResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (search)
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { orderNumber: { contains: search, mode: 'insensitive' } },
      ];

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: true,
          coupon: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),

      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((o) => this.map(o)),
      total,
      page,
      limit,
    };
  }

  // Lists the caller's own orders.
  async findAll(
    userId: string,
    query: QueryOrderDto,
  ): Promise<{
    data: OrderResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;
    if (search) where.OR = [{ id: { contains: search, mode: 'insensitive' } }];

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: true,
          coupon: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((o) => this.map(o)),
      total,
      page,
      limit,
    };
  }

  // Loads one order, scoped to its owner unless the caller is an admin.
  async findOne(
    id: string,
    userId?: string,
  ): Promise<OrderApiResponseDto<OrderResponseDto>> {
    const where: any = { id };
    if (userId) where.userId = userId;

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        user: true,
        coupon: { select: { code: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return this.wrap(order);
  }

  // Returns the stock every line of a cancelled order had reserved.
  private async restoreStock(
    tx: Prisma.TransactionClient,
    items: { productId: string; variantId: string | null; quantity: number }[],
  ): Promise<void> {
    for (const item of items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
        continue;
      }

      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  // A cancelled order never becomes a sale, so the redemption create() burned is
  // handed back to the code. GREATEST keeps it from ever going negative.
  private async releaseCoupon(
    tx: Prisma.TransactionClient,
    couponId: string | null,
  ): Promise<void> {
    if (!couponId) return;

    await tx.$executeRaw`
                UPDATE coupons
                SET "usedCount" = GREATEST("usedCount" - 1, 0)
                WHERE id = ${couponId}
            `;
  }

  // Where an order may go next: forward along the fulfilment path, or out to
  // CANCELLED while nothing has shipped yet. CANCELLED is terminal because
  // nothing re-reserves the stock that cancelling handed back, and a shipped
  // order must not restock either - the same rule payments.refund() applies.
  private static readonly transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.PROCESSING]: [
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
  };

  // Changes an order's status, returning stock to inventory on cancellation.
  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
  ): Promise<OrderApiResponseDto<OrderResponseDto>> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });
    if (!existing) throw new NotFoundException(`Order ${id} not found`);

    const target = updateOrderDto.status;

    // Re-sending the status an order already has is a no-op edit; any other
    // move has to be one the lifecycle allows.
    if (
      target &&
      target !== existing.status &&
      !OrdersService.transitions[existing.status].includes(target)
    ) {
      throw new BadRequestException(
        `An order that is ${existing.status} cannot be moved to ${target}`,
      );
    }

    const isCancelling =
      target === OrderStatus.CANCELLED &&
      existing.status !== OrderStatus.CANCELLED;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isCancelling) {
        // Claim the transition with the old status still in the predicate. Two
        // concurrent cancels can then no longer both reach the restock loop,
        // which is what used to hand the same units back twice.
        const claimed = await tx.order.updateMany({
          where: { id, status: existing.status },
          data: { status: OrderStatus.CANCELLED },
        });

        if (claimed.count === 0) {
          throw new BadRequestException(
            `Order ${id} changed status while it was being cancelled; nothing was applied`,
          );
        }

        await this.restoreStock(tx, existing.orderItems);
        await this.releaseCoupon(tx, existing.couponId);
      }

      return tx.order.update({
        where: { id },
        data: updateOrderDto,
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: true,
          coupon: { select: { code: true } },
        },
      });
    });

    if (updateOrderDto.status && updateOrderDto.status !== existing.status) {
      void this.notifyStatusChange(
        updated.orderNumber,
        updated.status,
        updated.user?.email,
      );
    }

    return this.wrap(updated, 'Order updated successfully');
  }

  // Emails the customer when their order's status changes.
  private async notifyStatusChange(
    orderNumber: string,
    status: OrderStatus,
    email?: string,
  ): Promise<void> {
    if (!email) return;

    try {
      const template = orderStatusEmail({
        orderNumber,
        status,
        orderUrl: `${frontendUrl()}/account`,
      });
      await this.mailService.send({ to: email, ...template });
    } catch (error) {
      this.logger.error(
        `Could not send status email for order ${orderNumber}: ${error.message}`,
      );
    }
  }

  // Applies the limited edits a customer may make to their own pending order.
  async updateOwn(
    id: string,
    userId: string,
    updateOrderUserDto: UpdateOrderUserDto,
  ): Promise<OrderApiResponseDto<OrderResponseDto>> {
    const existing = await this.prisma.order.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException(`Order ${id} not found`);

    if (existing.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending orders can be updated. Please contact support to change a processed order.',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        shippingAddress: updateOrderUserDto.shippingAddress,
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        user: true,
        coupon: { select: { code: true } },
      },
    });

    return this.wrap(updated, 'Shipping address updated');
  }

  // Cancels an order the caller owns and puts the stock back.
  async cancel(
    id: string,
    userId?: string,
  ): Promise<OrderApiResponseDto<OrderResponseDto>> {
    const where: any = { id };
    if (userId) where.userId = userId;
    const order = await this.prisma.order.findFirst({
      where,
      include: {
        orderItems: true,
        user: true,
        coupon: { select: { code: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be  cancelled');
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      // The read above only produces a friendly error: the status is re-asserted
      // here as part of the write, so of two racing cancels - or the expiry
      // sweep racing a payment that just landed - exactly one gets to restock.
      const claimed = await tx.order.updateMany({
        where: {
          id,
          status: OrderStatus.PENDING,
          NOT: { payment: { is: { status: PaymentStatus.COMPLETED } } },
        },
        data: { status: OrderStatus.CANCELLED },
      });

      if (claimed.count === 0) {
        const payment = await tx.payment.findUnique({
          where: { orderId: id },
          select: { status: true },
        });

        if (payment?.status === PaymentStatus.COMPLETED) {
          throw new BadRequestException(
            'This order has already been paid and can no longer be cancelled',
          );
        }

        throw new BadRequestException('Only pending orders can be  cancelled');
      }

      await this.restoreStock(tx, order.orderItems);
      await this.releaseCoupon(tx, order.couponId);

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: true,
          coupon: { select: { code: true } },
        },
      });
    });

    return this.wrap(cancelled, 'Order cancelled');
  }

  // Wraps an order in the response envelope with its message.
  private wrap(
    order: Order & {
      orderItems: (OrderItem & { product: Product })[];
      user: User;
    },
    message = 'Order retrieved successfully',
  ): OrderApiResponseDto<OrderResponseDto> {
    return {
      success: true,
      message,
      data: this.map(order),
    };
  }

  // Shapes an order row into its API response.
  private map(
    order: Order & {
      orderItems: (OrderItem & { product: Product })[];
      user: User;
      coupon?: { code: string } | null;
    },
  ): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      taxAmount: Number(order.taxAmount),
      couponCode: order.coupon?.code ?? null,
      total: Number(order.totalAmount),
      shippingAddress: order.shippingAddress ?? '',
      items: order.orderItems.map((item) => ({
        id: item.id,
        productId: item.productId,

        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        price: Number(item.price),
        // Round through cents: 29.99 * 7 is 209.92999999999998 in raw floats.
        subtotal: Math.round(Number(item.price) * item.quantity * 100) / 100,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
      ...(order.user && {
        userEmail: order.user.email,
        userName:
          `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim(),
      }),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  // Expires orders left unpaid past the hold window and releases their stock.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoCancelExpiredOrders() {
    const now = Date.now();
    const abandonedCutoff = new Date(now - 15 * 60 * 1000);

    const inFlightCutoff = new Date(now - 60 * 60 * 1000);

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,

        NOT: { payment: { is: { status: PaymentStatus.COMPLETED } } },
        OR: [
          { payment: { is: null }, createdAt: { lt: abandonedCutoff } },

          { payment: { isNot: null }, createdAt: { lt: inFlightCutoff } },
        ],
      },
    });

    if (expiredOrders.length > 0) {
      console.log(
        `[CronJob] Found ${expiredOrders.length} expired orders. Cleaning up...`,
      );
    }

    for (const order of expiredOrders) {
      try {
        await this.cancel(order.id);
        console.log(
          `[CronJob] Order ${order.id} has been automatically cancelled and the inventory has been returned.`,
        );
      } catch (error) {
        console.error(`[CronJob] Error canceling order ${order.id}:`, error);
      }
    }
  }
}
