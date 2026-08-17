import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { OrderApiResponseDto, OrderResponseDto } from '@/modules/orders/dto/order-response.dto';
import { Address, Order, OrderItem, OrderStatus, PaymentStatus, Prisma, Product, User } from '@prisma/client';
import { PricingService } from '@/modules/pricing/pricing.service';
import { QueryOrderDto } from '@/modules/orders/dto/query-order.dto';
import { UpdateOrderDto } from '@/modules/orders/dto/update-order.dto';
import { UpdateOrderUserDto } from '@/modules/orders/dto/update-order-user.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from '@/modules/mail/mail.service';
import { orderStatusEmail } from '@/modules/mail/mail.templates';
import { frontendUrl } from '@/modules/auth/auth.constants';

@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        private prisma: PrismaService,
        private mailService: MailService,
        private pricingService: PricingService,
    ) { }

    /** Flattens a saved address into the one-line snapshot stored on the order. */
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

    // Create
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

        // A saved address wins over the free-text field, but is flattened into a
        // snapshot so editing the address book never rewrites past orders.
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
            // Priced INSIDE the transaction: stock and coupon usage are checked
            // against the same snapshot that the writes below act on.
            const quote = await this.pricingService.quote(items, couponCode, tx);

            for (const item of quote.items) {
                // Stock lives on the variant when there is one. The guarded
                // updateMany is what makes this safe under concurrency: it
                // matches zero rows if someone else took the last unit first.
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
                // Guarded increment in one statement. Prisma cannot compare two
                // columns in a `where`, and doing it as read-then-write would let
                // two simultaneous checkouts both claim the final use.
                const claimed = await tx.$executeRaw`
                    UPDATE coupons
                    SET "usedCount" = "usedCount" + 1
                    WHERE id = ${quote.coupon.id}
                      AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
                `;

                if (claimed === 0) {
                    throw new BadRequestException('This promo code has just been fully redeemed');
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

        return this.wrap(order);
    }   

    // Get all orders for admin
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

    // Get user current orders
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

    // Find order by id
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

    // Update order by admin. Only reachable from the @Roles(ADMIN) route.
    async update(
        id: string,
        updateOrderDto: UpdateOrderDto,
    ): Promise<OrderApiResponseDto<OrderResponseDto>> {
        const existing = await this.prisma.order.findUnique({
            where: { id },
        });
        if (!existing) throw new NotFoundException(`Order ${id} not found`);

        const updated = await this.prisma.order.update({
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

        // Only mail on an actual transition — re-saving the same status from the
        // admin table should not spam the customer.
        if (updateOrderDto.status && updateOrderDto.status !== existing.status) {
            void this.notifyStatusChange(updated.orderNumber, updated.status, updated.user?.email);
        }

        return this.wrap(updated);
    }

    /** Best-effort notification. A failed email must not fail the update. */
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

    // Update own order. The owner may only correct the shipping address, and only
    // while the order is still PENDING — `status` is never taken from user input,
    // otherwise anyone could mark their unpaid order as DELIVERED.
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

        return this.wrap(updated);
    }

    // Cancel an order
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
            for (const item of order.orderItems) {
                // Put the units back where they came from: the variant if the
                // line had one, otherwise the product itself.
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

            return tx.order.update({
                where: { id },
                data: { status: OrderStatus.CANCELLED },
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

        return this.wrap(cancelled);
    }

    private wrap(
        order: Order & {
            orderItems: (OrderItem & { product: Product })[];
            user: User;
        },
    ): OrderApiResponseDto<OrderResponseDto> {
        return {
            success: true,
            message: 'Order retreived successfully',
            data: this.map(order),
        };
    }

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
                // Snapshot from the order, not the live product: renaming a
                // product must not rewrite what a past order says was bought.
                productName: item.productName,
                variantLabel: item.variantLabel,
                quantity: item.quantity,
                price: Number(item.price),
                subtotal: Number(item.price) * item.quantity,
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

    @Cron(CronExpression.EVERY_5_MINUTES)
    async autoCancelExpiredOrders() {
        const now = Date.now();
        const abandonedCutoff = new Date(now - 15 * 60 * 1000);
        // An order with a Stripe intent may still have the customer sitting on the
        // payment form. Cancelling it there would release the stock and then let the
        // charge succeed against a cancelled order, so give it a much longer grace.
        const inFlightCutoff = new Date(now - 60 * 60 * 1000);

        const expiredOrders = await this.prisma.order.findMany({
            where: {
                status: OrderStatus.PENDING,
                // Never release an order that has already been paid for.
                NOT: { payment: { is: { status: PaymentStatus.COMPLETED } } },
                OR: [
                    // Never reached checkout — plain abandoned cart.
                    { payment: { is: null }, createdAt: { lt: abandonedCutoff } },
                    // Payment was started but never completed.
                    { payment: { isNot: null }, createdAt: { lt: inFlightCutoff } },
                ],
            }
        });

        if (expiredOrders.length > 0) {
            console.log(`[CronJob] Found ${expiredOrders.length} expired orders. Cleaning up...`);
        }

        for (const order of expiredOrders) {
            try {
                await this.cancel(order.id);
                console.log(`[CronJob] Order ${order.id} has been automatically cancelled and the inventory has been returned.`);
            } catch (error) {
                console.error(`[CronJob] Error canceling order ${order.id}:`, error);
            }
        }
    }
}
