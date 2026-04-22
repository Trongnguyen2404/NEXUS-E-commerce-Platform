import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { OrderApiResponseDto, OrderResponseDto } from '@/modules/orders/dto/order-response.dto';
import { Order, OrderItem, OrderStatus, Prisma, Product, User } from '@prisma/client';
import { QueryOrderDto } from '@/modules/orders/dto/query-order.dto';
import { UpdateOrderDto } from '@/modules/orders/dto/update-order.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class OrdersService {
    constructor(private prisma: PrismaService) { }

    // Create
    async create(
        userId: string,
        createOrderDto: CreateOrderDto,
    ): Promise<OrderApiResponseDto<OrderResponseDto>> {
        const { items, shippingAddress } = createOrderDto;

        const orderItemsData: {
            productId: string;
            productName: string;
            quantity: number;
            price: number;
        }[] = [];

        let totalAmount = 0;

        for (const item of items) {
            const product = await this.prisma.product.findUnique({
                where: { id: item.productId },
            });

            if (!product) {
                throw new NotFoundException(
                    `Product with ID ${item.productId} not found`,
                );
            }

            if (product.stock < item.quantity) {
                throw new BadRequestException(
                    `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
                );
            }

            const productPrice = Number(product.price);

            orderItemsData.push({
                productId: product.id,
                productName: product.name, // Snapshot
                quantity: item.quantity,
                price: productPrice,
            });

            totalAmount += productPrice * item.quantity;
        }

        const latestCart = await this.prisma.cart.findFirst({
            where: {
                userId,
                checkedOut: false,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const order = await this.prisma.$transaction(async (tx) => {
            
            for (const item of orderItemsData) {
                const updatedProduct = await tx.product.updateMany({
                    where: {
                        id: item.productId,
                        stock: { gte: item.quantity },
                    },
                    data: {
                        stock: { decrement: item.quantity },
                    },
                });

                if (updatedProduct.count === 0) {
                    throw new BadRequestException(
                        `Product ${item.productName} is out of stock due to concurrent purchases.`,
                    );
                }
            }

            const newOrder = await tx.order.create({
                data: {
                    userId,
                    status: OrderStatus.PENDING,
                    totalAmount: totalAmount, 
                    shippingAddress,
                    cartId: latestCart?.id || null,
                    orderItems: {
                        create: orderItemsData.map((item) => ({
                            productId: item.productId,
                            productName: item.productName,
                            quantity: item.quantity,
                            price: item.price, 
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
            },
        });

        if (!order) {
            throw new NotFoundException(`Order with ID ${id} not found`);
        }

        return this.wrap(order);
    }

    // Update order by admin or user
    async update(
        id: string,
        updateOrderDto: UpdateOrderDto,
        userId?: string,
    ): Promise<OrderApiResponseDto<OrderResponseDto>> {
        const where: any = { id };
        if (userId) where.userId = userId;

        const existing = await this.prisma.order.findFirst({
            where,
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
        },
    ): OrderResponseDto {
        return {
            id: order.id,
            userId: order.userId,
            status: order.status,
            total: Number(order.totalAmount),
            shippingAddress: order.shippingAddress ?? '',
            items: order.orderItems.map((item) => ({
                id: item.id,
                productId: item.productId,
                productName: item.product.name,
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
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        
        const expiredOrders = await this.prisma.order.findMany({
            where: {
                status: 'PENDING',
                createdAt: { lt: fifteenMinutesAgo }
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
