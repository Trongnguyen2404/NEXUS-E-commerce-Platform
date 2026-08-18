import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DiscountType, OrderStatus, PaymentStatus } from '@prisma/client';
import { OrdersService } from '@/modules/orders/orders.service';
import type { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { PrismaService } from '@/prisma/prisma.service';
import type { MailService } from '@/modules/mail/mail.service';
import type {
  PricingService,
  Quote,
  QuoteLine,
} from '@/modules/pricing/pricing.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import {
  aCart,
  aProduct,
  aUser,
  anAddress,
  anOrder,
  anOrderItem,
  money,
} from '@/common/testing/factories';

// One order line as Prisma hands it back, with the product relation included.
const anItemRow = (over: Record<string, unknown> = {}) => ({
  ...anOrderItem(over),
  product: aProduct(),
});

// An order row shaped the way every read in this service includes it.
const anOrderRow = (over: Record<string, unknown> = {}) => ({
  ...anOrder(),
  user: aUser(),
  coupon: null as { code: string } | null,
  orderItems: [anItemRow()],
  ...over,
});

const aQuoteLine = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  productId: 'prod-1',
  productName: 'Nexus Headphones',
  variantId: null,
  variantLabel: null,
  unitPrice: 100,
  quantity: 2,
  lineTotal: 200,
  ...over,
});

const aQuote = (over: Partial<Quote> = {}): Quote => ({
  items: [aQuoteLine()],
  subtotal: 200,
  discountAmount: 0,
  coupon: null,
  shippingFee: 0,
  freeShippingThreshold: 100,
  amountToFreeShipping: 0,
  taxRate: 0.08,
  taxAmount: 16,
  total: 216,
  ...over,
});

describe('OrdersService', () => {
  let prisma: PrismaMock;
  let mail: { send: jest.Mock };
  let pricing: { quote: jest.Mock };
  let orders: OrdersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    pricing = { quote: jest.fn() };
    orders = new OrdersService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      pricing as unknown as PricingService,
    );
    // The service logs a failed status email; keep that out of the test output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
    jest.restoreAllMocks();
  });

  const executeRaw = () => prisma.$executeRaw as unknown as jest.Mock;

  // Stubs everything create() touches on the happy path.
  const givenPlaceableBasket = (quote: Quote = aQuote()) => {
    prisma.cart.findFirst.mockResolvedValue(null as never);
    pricing.quote.mockResolvedValue(quote);
    prisma.product.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.productVariant.updateMany.mockResolvedValue({ count: 1 } as never);
    executeRaw().mockResolvedValue(1);
    prisma.order.create.mockResolvedValue(anOrderRow() as never);
    prisma.cart.update.mockResolvedValue(aCart() as never);
    return quote;
  };

  const basketOf = (over: Partial<CreateOrderDto> = {}): CreateOrderDto => ({
    items: [{ productId: 'prod-1', quantity: 2 }],
    shippingAddress: '9 Nguyen Hue',
    ...over,
  });

  describe('create', () => {
    it('prices the basket through the pricing service inside the order transaction', async () => {
      givenPlaceableBasket();

      await orders.create('user-1', basketOf({ couponCode: 'SAVE10' }));

      // The third argument is the transaction client, so pricing and the writes
      // it authorises succeed or roll back together.
      expect(pricing.quote).toHaveBeenCalledWith(
        [{ productId: 'prod-1', quantity: 2 }],
        'SAVE10',
        prisma,
      );
    });

    it('stores every money component the quote produced rather than anything the client sent', async () => {
      givenPlaceableBasket(
        aQuote({
          subtotal: 200,
          discountAmount: 20,
          shippingFee: 9.99,
          taxAmount: 14.4,
          total: 204.39,
        }),
      );

      await orders.create('user-1', basketOf());

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: OrderStatus.PENDING,
            subtotal: 200,
            discountAmount: 20,
            shippingFee: 9.99,
            taxAmount: 14.4,
            totalAmount: 204.39,
          }),
        }),
      );
    });

    it('snapshots the priced name, label and unit price onto each order line', async () => {
      givenPlaceableBasket(
        aQuote({
          items: [
            aQuoteLine({
              productName: 'DeskLink Hub',
              variantId: 'var-1',
              variantLabel: '10-in-1',
              unitPrice: 149,
              quantity: 3,
            }),
          ],
        }),
      );

      await orders.create('user-1', basketOf());

      const { data } = prisma.order.create.mock.calls[0][0] as any;
      expect(data.orderItems.create).toEqual([
        {
          productId: 'prod-1',
          productName: 'DeskLink Hub',
          variantId: 'var-1',
          variantLabel: '10-in-1',
          quantity: 3,
          price: 149,
        },
      ]);
    });

    it('returns the placed order with the placement message', async () => {
      givenPlaceableBasket();

      const result = await orders.create('user-1', basketOf());

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order placed successfully');
      expect(result.data.id).toBe('order-1');
      expect(result.data.status).toBe(OrderStatus.PENDING);
    });

    it('claims product stock only while enough units remain', async () => {
      givenPlaceableBasket(aQuote({ items: [aQuoteLine({ quantity: 4 })] }));

      await orders.create('user-1', basketOf());

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', stock: { gte: 4 } },
        data: { stock: { decrement: 4 } },
      });
    });

    it('takes stock from the variant, not the parent product, when a variant was bought', async () => {
      givenPlaceableBasket(
        aQuote({
          items: [aQuoteLine({ variantId: 'var-1', quantity: 2 })],
        }),
      );

      await orders.create('user-1', basketOf());

      expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'var-1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it('decrements stock once per basket line', async () => {
      givenPlaceableBasket(
        aQuote({
          items: [
            aQuoteLine({ productId: 'prod-1' }),
            aQuoteLine({ productId: 'prod-2' }),
          ],
        }),
      );

      await orders.create('user-1', basketOf());

      expect(prisma.product.updateMany).toHaveBeenCalledTimes(2);
    });

    it('refuses the order when another buyer claimed the last unit first', async () => {
      givenPlaceableBasket();
      prisma.product.updateMany.mockResolvedValue({ count: 0 } as never);

      await expect(orders.create('user-1', basketOf())).rejects.toThrow(
        'Product Nexus Headphones is out of stock due to concurrent purchases.',
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('names the exact variant that ran out in the out-of-stock message', async () => {
      givenPlaceableBasket(
        aQuote({
          items: [
            aQuoteLine({
              productName: 'DeskLink Hub',
              variantId: 'var-1',
              variantLabel: '10-in-1',
            }),
          ],
        }),
      );
      prisma.productVariant.updateMany.mockResolvedValue({ count: 0 } as never);

      await expect(orders.create('user-1', basketOf())).rejects.toThrow(
        'Product DeskLink Hub (10-in-1) is out of stock due to concurrent purchases.',
      );
    });

    it('records a redemption against the coupon and links it to the order', async () => {
      givenPlaceableBasket(
        aQuote({
          coupon: {
            id: 'coupon-1',
            code: 'SAVE10',
            type: DiscountType.PERCENT,
            value: 10,
            discountAmount: 20,
          },
        }),
      );

      await orders.create('user-1', basketOf({ couponCode: 'SAVE10' }));

      expect(executeRaw()).toHaveBeenCalledTimes(1);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ couponId: 'coupon-1' }),
        }),
      );
    });

    it('refuses the order when the promo code was exhausted between pricing and payment', async () => {
      givenPlaceableBasket(
        aQuote({
          coupon: {
            id: 'coupon-1',
            code: 'SAVE10',
            type: DiscountType.PERCENT,
            value: 10,
            discountAmount: 20,
          },
        }),
      );
      executeRaw().mockResolvedValue(0);

      await expect(
        orders.create('user-1', basketOf({ couponCode: 'SAVE10' })),
      ).rejects.toThrow('This promo code has just been fully redeemed');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('touches no coupon counter when the basket carried no code', async () => {
      givenPlaceableBasket();

      await orders.create('user-1', basketOf());

      expect(executeRaw()).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ couponId: null }),
        }),
      );
    });

    it('flattens a saved address into the single line stored on the order', async () => {
      givenPlaceableBasket();
      prisma.address.findFirst.mockResolvedValue(anAddress() as never);

      await orders.create(
        'user-1',
        basketOf({ addressId: 'addr-1', shippingAddress: undefined }),
      );

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            addressId: 'addr-1',
            shippingAddress:
              'Lan Pham, 0900000000, 1 Test St, Ho Chi Minh, 700000, Vietnam',
          }),
        }),
      );
    });

    it('leaves the blank parts of an address out of the snapshot', async () => {
      givenPlaceableBasket();
      prisma.address.findFirst.mockResolvedValue(
        anAddress({
          line2: 'Apt 4',
          state: 'HCMC',
          phone: null,
          postalCode: null,
        }) as never,
      );

      await orders.create('user-1', basketOf({ addressId: 'addr-1' }));

      const { data } = prisma.order.create.mock.calls[0][0] as any;
      expect(data.shippingAddress).toBe(
        'Lan Pham, 1 Test St, Apt 4, Ho Chi Minh, HCMC, Vietnam',
      );
    });

    it('looks a saved address up against the caller, so one buyer cannot ship to another buyer address', async () => {
      givenPlaceableBasket();
      prisma.address.findFirst.mockResolvedValue(null as never);

      await expect(
        orders.create(
          'user-1',
          basketOf({ addressId: 'addr-of-someone-else' }),
        ),
      ).rejects.toThrow('Address not found');

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { id: 'addr-of-someone-else', userId: 'user-1' },
      });
    });

    it('prefers the saved address over free text when both are supplied', async () => {
      givenPlaceableBasket();
      prisma.address.findFirst.mockResolvedValue(anAddress() as never);

      await orders.create(
        'user-1',
        basketOf({ addressId: 'addr-1', shippingAddress: 'typed by hand' }),
      );

      const { data } = prisma.order.create.mock.calls[0][0] as any;
      expect(data.shippingAddress).toContain('1 Test St');
      expect(data.shippingAddress).not.toBe('typed by hand');
    });

    it('refuses an order with no address at all', async () => {
      givenPlaceableBasket();

      await expect(
        orders.create('user-1', basketOf({ shippingAddress: undefined })),
      ).rejects.toThrow(
        new BadRequestException('A shipping address is required'),
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('marks the buyer open cart checked out and records it on the order', async () => {
      givenPlaceableBasket();
      prisma.cart.findFirst.mockResolvedValue(aCart({ id: 'cart-7' }) as never);

      await orders.create('user-1', basketOf());

      expect(prisma.cart.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', checkedOut: false },
        }),
      );
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-7' },
        data: { checkedOut: true },
      });
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cartId: 'cart-7' }),
        }),
      );
    });

    it('places an order for a buyer with no open cart', async () => {
      givenPlaceableBasket();
      prisma.cart.findFirst.mockResolvedValue(null as never);

      await orders.create('user-1', basketOf());

      expect(prisma.cart.update).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cartId: null }),
        }),
      );
    });

    it('creates nothing when the pricing service rejects the basket as empty', async () => {
      givenPlaceableBasket();
      pricing.quote.mockRejectedValue(
        new BadRequestException('Cannot price an empty basket'),
      );

      await expect(
        orders.create('user-1', basketOf({ items: [] })),
      ).rejects.toThrow('Cannot price an empty basket');

      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });
  });

  describe('findAllForAdmin', () => {
    const givenPage = (rows: unknown[], total = rows.length) => {
      prisma.order.findMany.mockResolvedValue(rows as never);
      prisma.order.count.mockResolvedValue(total as never);
    };

    it('returns orders placed by anyone, with the paging metadata echoed back', async () => {
      givenPage(
        [anOrderRow(), anOrderRow({ id: 'order-2', userId: 'user-9' })],
        2,
      );

      const result = await orders.findAllForAdmin({});

      expect(result.data.map((o) => o.id)).toEqual(['order-1', 'order-2']);
      expect(result).toMatchObject({ total: 2, page: 1, limit: 10 });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('defaults to the first page of ten, newest first', async () => {
      givenPage([]);

      await orders.findAllForAdmin({});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('skips the pages before the one asked for', async () => {
      givenPage([]);

      const result = await orders.findAllForAdmin({ page: 3, limit: 20 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
      expect(result).toMatchObject({ page: 3, limit: 20 });
    });

    it('narrows the list to a single status', async () => {
      givenPage([anOrderRow({ status: OrderStatus.SHIPPED })]);

      await orders.findAllForAdmin({ status: OrderStatus.SHIPPED });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: OrderStatus.SHIPPED } }),
      );
    });

    it('searches the id and the order number case-insensitively', async () => {
      givenPage([]);

      await orders.findAllForAdmin({ search: 'ord-1' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { id: { contains: 'ord-1', mode: 'insensitive' } },
              { orderNumber: { contains: 'ord-1', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('counts against the same filter it lists with', async () => {
      givenPage([], 0);

      await orders.findAllForAdmin({ status: OrderStatus.CANCELLED });

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { status: OrderStatus.CANCELLED },
      });
    });

    it('returns an empty page when nothing matches', async () => {
      givenPage([], 0);

      const result = await orders.findAllForAdmin({
        status: OrderStatus.DELIVERED,
      });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findAll', () => {
    const givenPage = (rows: unknown[], total = rows.length) => {
      prisma.order.findMany.mockResolvedValue(rows as never);
      prisma.order.count.mockResolvedValue(total as never);
    };

    it('only ever lists orders belonging to the caller', async () => {
      givenPage([anOrderRow()]);

      await orders.findAll('user-1', {});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('keeps the owner filter when a status filter is added', async () => {
      givenPage([]);

      await orders.findAll('user-1', { status: OrderStatus.DELIVERED });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: OrderStatus.DELIVERED },
        }),
      );
    });

    it('pages the caller own history', async () => {
      givenPage([anOrderRow()], 37);

      const result = await orders.findAll('user-1', { page: 2, limit: 5 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
      expect(result).toMatchObject({ total: 37, page: 2, limit: 5 });
    });

    it('returns an empty history for a buyer who has never ordered', async () => {
      givenPage([], 0);

      const result = await orders.findAll('user-new', {});

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 10 });
    });
  });

  describe('findOne', () => {
    it('scopes the lookup to the caller when a user id is given', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrderRow() as never);

      await orders.findOne('order-1', 'user-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1', userId: 'user-1' } }),
      );
    });

    it('lets an admin read any order by omitting the owner filter', async () => {
      prisma.order.findFirst.mockResolvedValue(
        anOrderRow({ userId: 'someone-else' }) as never,
      );

      const result = await orders.findOne('order-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
      expect(result.data.userId).toBe('someone-else');
    });

    it('reports an order the caller does not own as not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null as never);

      await expect(orders.findOne('order-1', 'user-2')).rejects.toThrow(
        new NotFoundException('Order with ID order-1 not found'),
      );
    });

    it('wraps the order with the retrieval message', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrderRow() as never);

      const result = await orders.findOne('order-1', 'user-1');

      expect(result).toMatchObject({
        success: true,
        message: 'Order retrieved successfully',
      });
    });
  });

  describe('update', () => {
    const givenExisting = (over: Record<string, unknown> = {}) => {
      const existing = anOrderRow(over);
      prisma.order.findUnique.mockResolvedValue(existing as never);
      prisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.order.update.mockResolvedValue(existing as never);
      prisma.product.update.mockResolvedValue(aProduct() as never);
      prisma.productVariant.update.mockResolvedValue({} as never);
      return existing;
    };

    it('rejects a status change on an order that does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null as never);

      await expect(
        orders.update('order-9', { status: OrderStatus.SHIPPED }),
      ).rejects.toThrow(new NotFoundException('Order order-9 not found'));
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('writes the new status and reports the order updated', async () => {
      givenExisting();
      prisma.order.update.mockResolvedValue(
        anOrderRow({ status: OrderStatus.SHIPPED }) as never,
      );

      const result = await orders.update('order-1', {
        status: OrderStatus.SHIPPED,
      });

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: { status: OrderStatus.SHIPPED },
        }),
      );
      expect(result.message).toBe('Order updated successfully');
      expect(result.data.status).toBe(OrderStatus.SHIPPED);
    });

    it('leaves stock alone for a status change that is not a cancellation', async () => {
      givenExisting({ status: OrderStatus.PENDING });

      await orders.update('order-1', { status: OrderStatus.PROCESSING });

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('returns each line quantity to the product when the order is cancelled', async () => {
      givenExisting({
        status: OrderStatus.PENDING,
        orderItems: [
          anItemRow({ productId: 'prod-1', quantity: 2 }),
          anItemRow({ id: 'oi-2', productId: 'prod-2', quantity: 5 }),
        ],
      });

      await orders.update('order-1', { status: OrderStatus.CANCELLED });

      expect(prisma.product.update).toHaveBeenCalledTimes(2);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-2' },
        data: { stock: { increment: 5 } },
      });
    });

    it('returns stock to the variant rather than the product when the line had one', async () => {
      givenExisting({
        orderItems: [anItemRow({ variantId: 'var-1', quantity: 3 })],
      });

      await orders.update('order-1', { status: OrderStatus.CANCELLED });

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { stock: { increment: 3 } },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('puts nothing back when the order was already cancelled', async () => {
      givenExisting({ status: OrderStatus.CANCELLED });

      await orders.update('order-1', { status: OrderStatus.CANCELLED });

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('emails the customer when the status actually changes', async () => {
      givenExisting({ status: OrderStatus.PENDING });
      prisma.order.update.mockResolvedValue(
        anOrderRow({ status: OrderStatus.SHIPPED }) as never,
      );

      await orders.update('order-1', { status: OrderStatus.SHIPPED });

      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0]).toMatchObject({
        to: 'buyer@nexus.test',
      });
      expect(mail.send.mock.calls[0][0].subject).toContain('ORD-1');
    });

    it('sends no email when the status is set to what it already was', async () => {
      givenExisting({ status: OrderStatus.SHIPPED });

      await orders.update('order-1', { status: OrderStatus.SHIPPED });

      expect(mail.send).not.toHaveBeenCalled();
    });

    it('sends no email when only the shipping address is corrected', async () => {
      givenExisting();

      await orders.update('order-1', { shippingAddress: '12 New Road' });

      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { shippingAddress: '12 New Road' } }),
      );
    });

    it('still reports the update as successful when the status email fails', async () => {
      givenExisting({ status: OrderStatus.PENDING });
      prisma.order.update.mockResolvedValue(
        anOrderRow({ status: OrderStatus.DELIVERED }) as never,
      );
      mail.send.mockRejectedValue(new Error('smtp is down'));

      const result = await orders.update('order-1', {
        status: OrderStatus.DELIVERED,
      });

      expect(result.message).toBe('Order updated successfully');
    });

    describe('status transitions', () => {
      // Cancelling handed the stock back and nothing re-reserves it, so an
      // order that leaves CANCELLED would be live with no units held for it.
      it('refuses to move a cancelled order back into the fulfilment flow', async () => {
        givenExisting({ status: OrderStatus.CANCELLED });

        await expect(
          orders.update('order-1', { status: OrderStatus.PROCESSING }),
        ).rejects.toThrow(
          'An order that is CANCELLED cannot be moved to PROCESSING',
        );
        expect(prisma.order.update).not.toHaveBeenCalled();
        expect(prisma.order.updateMany).not.toHaveBeenCalled();
      });

      it('never restocks an order twice across an un-cancel and a re-cancel', async () => {
        givenExisting({
          status: OrderStatus.CANCELLED,
          orderItems: [anItemRow({ quantity: 5 })],
        });

        // Re-sending CANCELLED is a no-op, and the un-cancel is refused, so the
        // five units can never come back a second time.
        await orders.update('order-1', { status: OrderStatus.CANCELLED });
        await expect(
          orders.update('order-1', { status: OrderStatus.PROCESSING }),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.product.update).not.toHaveBeenCalled();
      });

      it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
        'refuses to cancel an order that is already %s, so shipped goods are never restocked',
        async (status) => {
          givenExisting({ status, orderItems: [anItemRow({ quantity: 4 })] });

          await expect(
            orders.update('order-1', { status: OrderStatus.CANCELLED }),
          ).rejects.toThrow(
            `An order that is ${status} cannot be moved to CANCELLED`,
          );
          expect(prisma.product.update).not.toHaveBeenCalled();
          expect(prisma.order.update).not.toHaveBeenCalled();
        },
      );

      it('refuses to walk an order backwards from SHIPPED to PROCESSING', async () => {
        givenExisting({ status: OrderStatus.SHIPPED });

        await expect(
          orders.update('order-1', { status: OrderStatus.PROCESSING }),
        ).rejects.toThrow(BadRequestException);
      });

      it('still lets a pending order move forward', async () => {
        givenExisting({ status: OrderStatus.PENDING });

        await expect(
          orders.update('order-1', { status: OrderStatus.PROCESSING }),
        ).resolves.toBeDefined();
      });

      it('corrects the address of a cancelled order without asking for a transition', async () => {
        givenExisting({ status: OrderStatus.CANCELLED });

        await expect(
          orders.update('order-1', { shippingAddress: '12 New Road' }),
        ).resolves.toBeDefined();
      });
    });

    describe('cancellation is claimed, not assumed', () => {
      it('claims the cancellation against the status it read', async () => {
        givenExisting({ status: OrderStatus.PROCESSING });

        await orders.update('order-1', { status: OrderStatus.CANCELLED });

        expect(prisma.order.updateMany).toHaveBeenCalledWith({
          where: { id: 'order-1', status: OrderStatus.PROCESSING },
          data: { status: OrderStatus.CANCELLED },
        });
      });

      it('restocks nothing when a concurrent cancel already claimed the order', async () => {
        givenExisting({
          status: OrderStatus.PENDING,
          orderItems: [anItemRow({ quantity: 5 })],
        });
        prisma.order.updateMany.mockResolvedValue({ count: 0 } as never);

        await expect(
          orders.update('order-1', { status: OrderStatus.CANCELLED }),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.product.update).not.toHaveBeenCalled();
        expect(prisma.productVariant.update).not.toHaveBeenCalled();
        expect(prisma.order.update).not.toHaveBeenCalled();
      });
    });

    describe('coupon redemption', () => {
      it('hands the redemption back to the promo code when the order is cancelled', async () => {
        givenExisting({ status: OrderStatus.PENDING, couponId: 'coupon-1' });

        await orders.update('order-1', { status: OrderStatus.CANCELLED });

        expect(executeRaw()).toHaveBeenCalledTimes(1);
      });

      it('touches no coupon counter when the cancelled order carried no code', async () => {
        givenExisting({ status: OrderStatus.PENDING, couponId: null });

        await orders.update('order-1', { status: OrderStatus.CANCELLED });

        expect(executeRaw()).not.toHaveBeenCalled();
      });

      it('touches no coupon counter for a status change that is not a cancellation', async () => {
        givenExisting({ status: OrderStatus.PENDING, couponId: 'coupon-1' });

        await orders.update('order-1', { status: OrderStatus.SHIPPED });

        expect(executeRaw()).not.toHaveBeenCalled();
      });
    });
  });

  describe('updateOwn', () => {
    it('lets the buyer correct the shipping address on a pending order', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrderRow() as never);
      prisma.order.update.mockResolvedValue(
        anOrderRow({ shippingAddress: '12 New Road' }) as never,
      );

      const result = await orders.updateOwn('order-1', 'user-1', {
        shippingAddress: '12 New Road',
      });

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: { shippingAddress: '12 New Road' },
        }),
      );
      expect(result.message).toBe('Shipping address updated');
      expect(result.data.shippingAddress).toBe('12 New Road');
    });

    it('ignores every field except the shipping address', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrderRow() as never);
      prisma.order.update.mockResolvedValue(anOrderRow() as never);

      await orders.updateOwn('order-1', 'user-1', {
        shippingAddress: '12 New Road',
        status: OrderStatus.DELIVERED,
        totalAmount: 0,
      } as never);

      const { data } = prisma.order.update.mock.calls[0][0] as any;
      expect(data).toEqual({ shippingAddress: '12 New Road' });
    });

    it('finds the order by id and owner together, so a stranger order is not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null as never);

      await expect(
        orders.updateOwn('order-1', 'user-2', { shippingAddress: 'x' }),
      ).rejects.toThrow(new NotFoundException('Order order-1 not found'));

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1', userId: 'user-2' },
      });
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])('refuses to edit an order that is already %s', async (status) => {
      prisma.order.findFirst.mockResolvedValue(anOrderRow({ status }) as never);

      await expect(
        orders.updateOwn('order-1', 'user-1', { shippingAddress: 'x' }),
      ).rejects.toThrow(
        'Only pending orders can be updated. Please contact support to change a processed order.',
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    const givenCancellable = (over: Record<string, unknown> = {}) => {
      const order = anOrderRow(over);
      prisma.order.findFirst.mockResolvedValue(order as never);
      prisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.order.findUniqueOrThrow.mockResolvedValue(
        anOrderRow({ ...over, status: OrderStatus.CANCELLED }) as never,
      );
      prisma.product.update.mockResolvedValue(aProduct() as never);
      prisma.productVariant.update.mockResolvedValue({} as never);
      return order;
    };

    it('cancels the caller own pending order and says so', async () => {
      givenCancellable();

      const result = await orders.cancel('order-1', 'user-1');

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.CANCELLED },
        }),
      );
      expect(result.message).toBe('Order cancelled');
      expect(result.data.status).toBe(OrderStatus.CANCELLED);
    });

    it('scopes the lookup to the caller', async () => {
      givenCancellable();

      await orders.cancel('order-1', 'user-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1', userId: 'user-1' } }),
      );
    });

    it('lets an admin or the expiry sweep cancel without an owner filter', async () => {
      givenCancellable({ userId: 'someone-else' });

      await orders.cancel('order-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
    });

    it('reports an order belonging to someone else as not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null as never);

      await expect(orders.cancel('order-1', 'user-2')).rejects.toThrow(
        new NotFoundException('Order order-1 not found'),
      );
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('returns every line quantity to stock', async () => {
      givenCancellable({
        orderItems: [
          anItemRow({ productId: 'prod-1', quantity: 2 }),
          anItemRow({ id: 'oi-2', productId: 'prod-2', quantity: 4 }),
        ],
      });

      await orders.cancel('order-1', 'user-1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-2' },
        data: { stock: { increment: 4 } },
      });
      expect(prisma.product.update).toHaveBeenCalledTimes(2);
    });

    it('returns variant lines to the variant row', async () => {
      givenCancellable({
        orderItems: [anItemRow({ variantId: 'var-1', quantity: 3 })],
      });

      await orders.cancel('order-1', 'user-1');

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { stock: { increment: 3 } },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])('refuses to cancel an order that is already %s', async (status) => {
      givenCancellable({ status });

      await expect(orders.cancel('order-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(orders.cancel('order-1', 'user-1')).rejects.toThrow(
        /Only pending orders can be\s+cancelled/,
      );
    });

    it('puts no stock back when the order is too far along to cancel', async () => {
      givenCancellable({ status: OrderStatus.SHIPPED });

      await expect(orders.cancel('order-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    describe('the cancellation is claimed in the database', () => {
      it('re-asserts PENDING and an uncompleted payment as part of the write', async () => {
        givenCancellable();

        await orders.cancel('order-1', 'user-1');

        expect(prisma.order.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'order-1',
            status: OrderStatus.PENDING,
            NOT: { payment: { is: { status: PaymentStatus.COMPLETED } } },
          },
          data: { status: OrderStatus.CANCELLED },
        });
      });

      it('returns no stock for the cancel that loses a race with another cancel', async () => {
        givenCancellable({ orderItems: [anItemRow({ quantity: 3 })] });
        prisma.order.updateMany.mockResolvedValue({ count: 0 } as never);

        await expect(orders.cancel('order-1', 'user-1')).rejects.toThrow(
          BadRequestException,
        );

        expect(prisma.product.update).not.toHaveBeenCalled();
        expect(prisma.productVariant.update).not.toHaveBeenCalled();
      });

      it('refuses to cancel a pending order whose payment completed a moment earlier', async () => {
        givenCancellable({ orderItems: [anItemRow({ quantity: 3 })] });
        prisma.order.updateMany.mockResolvedValue({ count: 0 } as never);
        prisma.payment.findUnique.mockResolvedValue({
          status: PaymentStatus.COMPLETED,
        } as never);

        await expect(orders.cancel('order-1')).rejects.toThrow(
          'This order has already been paid and can no longer be cancelled',
        );
        expect(prisma.product.update).not.toHaveBeenCalled();
      });
    });

    describe('coupon redemption', () => {
      it('hands the redemption back to the promo code the order used', async () => {
        givenCancellable({ couponId: 'coupon-1' });

        await orders.cancel('order-1', 'user-1');

        expect(executeRaw()).toHaveBeenCalledTimes(1);
      });

      it('touches no coupon counter for an order placed without a code', async () => {
        givenCancellable({ couponId: null });

        await orders.cancel('order-1', 'user-1');

        expect(executeRaw()).not.toHaveBeenCalled();
      });
    });
  });

  describe('autoCancelExpiredOrders', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('leaves the stock of an expired order alone when its payment completed before the sweep reached it', async () => {
      prisma.order.findMany.mockResolvedValue([anOrder()] as never);
      prisma.order.findFirst.mockResolvedValue(
        anOrderRow({ orderItems: [anItemRow({ quantity: 3 })] }) as never,
      );
      prisma.order.updateMany.mockResolvedValue({ count: 0 } as never);
      prisma.payment.findUnique.mockResolvedValue({
        status: PaymentStatus.COMPLETED,
      } as never);

      await orders.autoCancelExpiredOrders();

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('cancels and restocks an expired order that nobody paid for', async () => {
      prisma.order.findMany.mockResolvedValue([anOrder()] as never);
      prisma.order.findFirst.mockResolvedValue(
        anOrderRow({ orderItems: [anItemRow({ quantity: 3 })] }) as never,
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.order.findUniqueOrThrow.mockResolvedValue(
        anOrderRow({ status: OrderStatus.CANCELLED }) as never,
      );
      prisma.product.update.mockResolvedValue(aProduct() as never);

      await orders.autoCancelExpiredOrders();

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 3 } },
      });
    });
  });

  describe('response shaping', () => {
    const shapeOf = async (over: Record<string, unknown> = {}) => {
      prisma.order.findFirst.mockResolvedValue(anOrderRow(over) as never);
      const { data } = await orders.findOne('order-1');
      return data;
    };

    it('turns every decimal money column into a plain number', async () => {
      const data = await shapeOf({
        subtotal: money(200),
        discountAmount: money(20),
        shippingFee: money(9.99),
        taxAmount: money(14.4),
        totalAmount: money(204.39),
      });

      expect(data).toMatchObject({
        subtotal: 200,
        discountAmount: 20,
        shippingFee: 9.99,
        taxAmount: 14.4,
        total: 204.39,
      });
    });

    it('multiplies unit price by quantity for each line subtotal', async () => {
      const data = await shapeOf({
        orderItems: [anItemRow({ price: money(25), quantity: 4 })],
      });

      expect(data.items[0]).toMatchObject({
        price: 25,
        quantity: 4,
        subtotal: 100,
      });
    });

    // 29.99 * 7 is 209.92999999999998 in raw floats; this is the one money
    // field on the response that did not round through cents.
    it('rounds a line subtotal to cents instead of emitting float noise', async () => {
      const data = await shapeOf({
        orderItems: [anItemRow({ price: money(29.99), quantity: 7 })],
      });

      expect(data.items[0].subtotal).toBe(209.93);
    });

    it('carries the product and variant names captured at purchase time', async () => {
      const data = await shapeOf({
        orderItems: [
          anItemRow({
            productName: 'DeskLink Hub',
            variantLabel: '10-in-1 / Graphite',
          }),
        ],
      });

      expect(data.items[0].productName).toBe('DeskLink Hub');
      expect(data.items[0].variantLabel).toBe('10-in-1 / Graphite');
    });

    it('reports no variant label for a line without one', async () => {
      const data = await shapeOf({ orderItems: [anItemRow()] });

      expect(data.items[0].variantLabel).toBeNull();
    });

    it('returns an empty item list for an order with no lines', async () => {
      const data = await shapeOf({ orderItems: [] });

      expect(data.items).toEqual([]);
    });

    it('exposes the promo code that was applied', async () => {
      const data = await shapeOf({ coupon: { code: 'SAVE10' } });

      expect(data.couponCode).toBe('SAVE10');
    });

    it('reports a null promo code when none was used', async () => {
      const data = await shapeOf({ coupon: null });

      expect(data.couponCode).toBeNull();
    });

    it('reports the customer email and full name alongside the order', async () => {
      const data = await shapeOf({
        user: aUser({
          email: 'lan@nexus.test',
          firstName: 'Lan',
          lastName: 'Pham',
        }),
      });

      expect(data).toMatchObject({
        userEmail: 'lan@nexus.test',
        userName: 'Lan Pham',
      });
    });

    it('trims the name when the customer gave only a first name', async () => {
      const data = await shapeOf({
        user: aUser({ firstName: 'Lan', lastName: null }),
      });

      expect(data).toMatchObject({ userName: 'Lan' });
    });

    it('falls back to an empty shipping address rather than null', async () => {
      const data = await shapeOf({ shippingAddress: null });

      expect(data.shippingAddress).toBe('');
    });
  });
});
