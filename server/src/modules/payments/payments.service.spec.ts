import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PaymentsService } from '@/modules/payments/payments.service';
import { MailService } from '@/modules/mail/mail.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import {
  aProduct,
  aUser,
  aVariant,
  anOrder,
  anOrderItem,
  money,
} from '@/common/testing/factories';

// The service builds `new Stripe(...)` in its constructor, so the SDK is
// replaced with a single shared fake whose instance the tests can reach.
jest.mock('stripe', () => {
  const instance = {
    paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
    refunds: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  };
  const StripeCtor = jest.fn(() => instance);
  Object.assign(StripeCtor, { __instance: instance });
  return { __esModule: true, default: StripeCtor };
});

type StripeMock = {
  paymentIntents: { create: jest.Mock; retrieve: jest.Mock };
  refunds: { create: jest.Mock };
  webhooks: { constructEvent: jest.Mock };
};

const stripe = (Stripe as unknown as { __instance: StripeMock }).__instance;

const AT = new Date('2026-01-01T00:00:00.000Z');

// Payments have no shared factory yet, so this spec carries its own.
const aPayment = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  amount: money(108),
  status: PaymentStatus.PENDING,
  currency: 'usd',
  paymentMethod: 'STRIPE',
  transactionId: 'pi_1',
  refundedAmount: money(0),
  refundedAt: null,
  refundReason: null,
  userId: 'user-1',
  orderId: 'order-1',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

const anIntent = (over: Record<string, unknown> = {}) => ({
  id: 'pi_1',
  client_secret: 'pi_1_secret_abc',
  status: 'succeeded',
  amount: 10800,
  currency: 'usd',
  ...over,
});

const RAW_BODY = Buffer.from('{"id":"evt_1"}');
const SIGNATURE = 't=1,v1=deadbeef';

// Lets a fire-and-forget email promise settle before the assertion runs.
const flushPendingEmails = () =>
  new Promise((resolve) => setImmediate(resolve));

describe('PaymentsService', () => {
  let prisma: PrismaMock;
  let mail: { send: jest.Mock };
  let payments: PaymentsService;

  const ENV = { ...process.env };

  beforeEach(() => {
    prisma = createPrismaMock();
    mail = { send: jest.fn().mockResolvedValue(true) };
    payments = new PaymentsService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
    );

    stripe.paymentIntents.create.mockReset();
    stripe.paymentIntents.retrieve.mockReset();
    stripe.refunds.create.mockReset();
    stripe.webhooks.constructEvent.mockReset();

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
    jest.restoreAllMocks();
    process.env = { ...ENV };
  });

  const lastCall = (fn: unknown) =>
    (fn as jest.Mock).mock.calls[
      (fn as jest.Mock).mock.calls.length - 1
    ][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
      create?: Record<string, unknown>;
      update?: Record<string, unknown>;
    };

  describe('createPaymentIntent', () => {
    const givenOrder = (over: Record<string, unknown> = {}) => {
      const order = anOrder(over);
      prisma.order.findFirst.mockResolvedValue(order as never);
      prisma.payment.findFirst.mockResolvedValue(null as never);
      stripe.paymentIntents.create.mockResolvedValue(anIntent());
      prisma.payment.upsert.mockResolvedValue(aPayment() as never);
      return order;
    };

    it('rejects an order that does not exist', async () => {
      prisma.order.findFirst.mockResolvedValue(null as never);

      await expect(
        payments.createPaymentIntent('user-1', { orderId: 'order-404' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('looks the order up scoped to the caller, so another shopper cannot pay for it', async () => {
      prisma.order.findFirst.mockResolvedValue(null as never);

      await expect(
        payments.createPaymentIntent('intruder', { orderId: 'order-1' }),
      ).rejects.toThrow('Không tìm thấy đơn hàng với ID order-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1', userId: 'intruder' },
      });
    });

    it('refuses to charge an order that has already been paid for', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrder() as never);
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.COMPLETED }) as never,
      );

      await expect(
        payments.createPaymentIntent('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow('Đơn hàng này đã được thanh toán thành công trước đó');

      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('lets a shopper retry after a failed payment', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrder() as never);
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.FAILED }) as never,
      );
      stripe.paymentIntents.create.mockResolvedValue(anIntent({ id: 'pi_2' }));
      prisma.payment.upsert.mockResolvedValue(aPayment() as never);

      await expect(
        payments.createPaymentIntent('user-1', { orderId: 'order-1' }),
      ).resolves.toMatchObject({ success: true });

      expect(lastCall(prisma.payment.upsert).update).toMatchObject({
        status: PaymentStatus.PENDING,
        transactionId: 'pi_2',
      });
    });

    it('converts the order total into whole cents', async () => {
      givenOrder({ totalAmount: money(108.35) });

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      // 108.35 * 100 is 10834.999999999998 in IEEE 754.
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 10835 }),
      );
    });

    it('never sends Stripe a fractional amount', async () => {
      givenOrder({ totalAmount: money(19.99) });

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      const { amount } = stripe.paymentIntents.create.mock.calls[0][0] as {
        amount: number;
      };
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBe(1999);
    });

    it('charges the stored order total, ignoring any amount the client sends', async () => {
      givenOrder({ totalAmount: money(250) });

      await payments.createPaymentIntent('user-1', {
        orderId: 'order-1',
        // A hostile client trying to pay one cent for a $250 order.
        amount: 1,
      } as never);

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 25000 }),
      );
      expect(lastCall(prisma.payment.upsert).create).toMatchObject({
        amount: money(250),
      });
    });

    it('defaults the currency to usd', async () => {
      givenOrder();

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'usd' }),
      );
      expect(lastCall(prisma.payment.upsert).create).toMatchObject({
        currency: 'usd',
      });
    });

    it('ignores a currency the client asks for, so a zero-decimal one cannot undercharge', async () => {
      givenOrder({ totalAmount: money(100) });

      // vnd is a zero-decimal currency: honoured here it would settle a $100
      // order for 10,000 VND, well under a dollar.
      await payments.createPaymentIntent('user-1', {
        orderId: 'order-1',
        currency: 'vnd',
      } as never);

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'usd', amount: 10000 }),
      );
      expect(lastCall(prisma.payment.upsert).create).toMatchObject({
        currency: 'usd',
      });
    });

    it('bills a zero-decimal store currency in whole units', async () => {
      process.env.PAYMENT_CURRENCY = 'vnd';
      givenOrder({ totalAmount: money(250000) });

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'vnd', amount: 250000 }),
      );
    });

    it('refuses to open an intent on an order that is no longer pending', async () => {
      prisma.order.findFirst.mockResolvedValue(
        anOrder({ status: OrderStatus.CANCELLED }) as never,
      );

      await expect(
        payments.createPaymentIntent('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow('không còn ở trạng thái chờ thanh toán');

      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(prisma.payment.upsert).not.toHaveBeenCalled();
    });

    it('refuses to re-use the payment row of a refunded order', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrder() as never);
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({
          status: PaymentStatus.REFUNDED,
          refundedAmount: money(108),
        }) as never,
      );

      await expect(
        payments.createPaymentIntent('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow('đã được hoàn tiền');

      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('clears the previous attempt refund figures when it re-points the row', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrder() as never);
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.FAILED }) as never,
      );
      stripe.paymentIntents.create.mockResolvedValue(anIntent({ id: 'pi_2' }));
      prisma.payment.upsert.mockResolvedValue(aPayment() as never);

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      expect(lastCall(prisma.payment.upsert).update).toMatchObject({
        currency: 'usd',
        refundedAmount: 0,
        refundedAt: null,
        refundReason: null,
      });
    });

    it('describes the intent by order id when no description is supplied', async () => {
      givenOrder();

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Thanh toán đơn hàng #order-1',
        }),
      );
    });

    it('uses the supplied description when there is one', async () => {
      givenOrder();

      await payments.createPaymentIntent('user-1', {
        orderId: 'order-1',
        description: 'Black Friday basket',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Black Friday basket' }),
      );
    });

    it('tags the intent with the order and user so a webhook can reconcile it', async () => {
      givenOrder();

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { orderId: 'order-1', userId: 'user-1' },
        }),
      );
    });

    it('stores the payment as pending, keyed on the order', async () => {
      givenOrder();

      await payments.createPaymentIntent('user-1', { orderId: 'order-1' });

      const call = lastCall(prisma.payment.upsert);
      expect(call.where).toEqual({ orderId: 'order-1' });
      expect(call.create).toMatchObject({
        status: PaymentStatus.PENDING,
        paymentMethod: 'STRIPE',
        transactionId: 'pi_1',
        userId: 'user-1',
      });
    });

    it('returns the client secret and the stored payment id', async () => {
      givenOrder();
      stripe.paymentIntents.create.mockResolvedValue(
        anIntent({ client_secret: 'pi_9_secret_zzz' }),
      );
      prisma.payment.upsert.mockResolvedValue(
        aPayment({ id: 'pay-77' }) as never,
      );

      const result = await payments.createPaymentIntent('user-1', {
        orderId: 'order-1',
      });

      expect(result).toEqual({
        success: true,
        data: { clientSecret: 'pi_9_secret_zzz', paymentId: 'pay-77' },
        message: 'Tạo yêu cầu thanh toán thành công',
      });
    });

    it('surfaces a Stripe failure as a bad request', async () => {
      prisma.order.findFirst.mockResolvedValue(anOrder() as never);
      prisma.payment.findFirst.mockResolvedValue(null as never);
      stripe.paymentIntents.create.mockRejectedValue(
        new Error('Your card was declined'),
      );

      await expect(
        payments.createPaymentIntent('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow('Lỗi khi tạo thanh toán: Your card was declined');
    });
  });

  describe('confirmPayment', () => {
    const CONFIRM = { paymentIntentId: 'pi_1', orderId: 'order-1' };

    const givenPendingPayment = (
      paymentOver: Record<string, unknown> = {},
      orderOver: Record<string, unknown> = {},
    ) => {
      const payment = aPayment(paymentOver);
      prisma.payment.findFirst.mockResolvedValue(payment as never);
      prisma.order.findUnique.mockResolvedValue(anOrder(orderOver) as never);
      prisma.payment.update.mockResolvedValue(
        aPayment({ status: PaymentStatus.COMPLETED, ...paymentOver }) as never,
      );
      // The row claims the COMPLETED transition; count 1 means this caller won.
      prisma.payment.updateMany.mockResolvedValue({ count: 1 } as never);
      // Stripe collected exactly what the payment row promises.
      stripe.paymentIntents.retrieve.mockResolvedValue(
        anIntent({
          amount: Math.round(Number(payment.amount) * 100),
          currency: payment.currency,
        }),
      );
      return payment;
    };

    it('rejects an intent that does not belong to the caller', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await expect(
        payments.confirmPayment('intruder', CONFIRM),
      ).rejects.toThrow('payment not found');

      // Owner, order and intent must all line up before Stripe is consulted.
      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: {
          orderId: 'order-1',
          userId: 'intruder',
          transactionId: 'pi_1',
        },
      });
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('refuses to confirm a payment that is already completed', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.COMPLETED }) as never,
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('refuses an intent Stripe has not settled', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);
      stripe.paymentIntents.retrieve.mockResolvedValue(
        anIntent({ status: 'requires_payment_method' }),
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        'Payment not successful',
      );
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('marks the payment completed and moves a pending order into processing', async () => {
      givenPendingPayment({}, { status: OrderStatus.PENDING });

      const result = await payments.confirmPayment('user-1', CONFIRM);

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: { not: PaymentStatus.COMPLETED } },
        data: { status: PaymentStatus.COMPLETED },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PROCESSING },
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe(PaymentStatus.COMPLETED);
    });

    it('returns the amount as a plain number rather than a Decimal', async () => {
      givenPendingPayment({ amount: money(42.5) });

      const result = await payments.confirmPayment('user-1', CONFIRM);

      expect(result.data.amount).toBe(42.5);
      expect(typeof result.data.amount).toBe('number');
    });

    it('leaves an order that is already processing where it is', async () => {
      givenPendingPayment({}, { status: OrderStatus.PROCESSING });

      await payments.confirmPayment('user-1', CONFIRM);

      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('checks out the cart the order was created from', async () => {
      givenPendingPayment({}, { cartId: 'cart-9' });

      await payments.confirmPayment('user-1', CONFIRM);

      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-9' },
        data: { checkedOut: true },
      });
    });

    it('touches no cart when the order did not come from one', async () => {
      givenPendingPayment({}, { cartId: null });

      await payments.confirmPayment('user-1', CONFIRM);

      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('fails when the order behind the payment has vanished', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);
      stripe.paymentIntents.retrieve.mockResolvedValue(anIntent());
      prisma.order.findUnique.mockResolvedValue(null as never);

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        'Order with ID order-1 not found',
      );
    });

    it('does not resurrect an order that was cancelled before the charge landed', async () => {
      givenPendingPayment({}, { status: OrderStatus.CANCELLED });
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('never banks a charge against a cancelled order: it refunds and says so', async () => {
      givenPendingPayment({}, { status: OrderStatus.CANCELLED });
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });
      prisma.payment.update.mockResolvedValue(
        aPayment({ status: PaymentStatus.REFUNDED }) as never,
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        'the charge has been refunded',
      );

      // The money goes back...
      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_1' }),
        expect.objectContaining({
          idempotencyKey: 'cancelled-order-refund-pay-1',
        }),
      );
      // ...and the payment is never counted as collected revenue.
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(lastCall(prisma.payment.update).data).toMatchObject({
        status: PaymentStatus.REFUNDED,
        refundedAmount: money(108),
      });
    });

    it('leaves the payment alone when the automatic refund itself fails', async () => {
      givenPendingPayment({}, { status: OrderStatus.CANCELLED });
      stripe.refunds.create.mockRejectedValue(new Error('Stripe is down'));

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('fulfils the order once and only once across repeated confirmations', async () => {
      givenPendingPayment({}, { status: OrderStatus.PENDING });

      await payments.confirmPayment('user-1', CONFIRM);

      // Second attempt sees the payment the first one completed.
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.COMPLETED }) as never,
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        'Payment already completed',
      );
      expect(prisma.order.update).toHaveBeenCalledTimes(1);
      expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
    });

    it('sends no second confirmation email when the webhook won the race', async () => {
      givenPendingPayment({}, { status: OrderStatus.PENDING });
      // The webhook completed the row between our read and our write, so the
      // conditional update matches nothing.
      prisma.payment.updateMany.mockResolvedValue({ count: 0 } as never);
      prisma.order.findUnique.mockResolvedValue(
        anOrder({
          orderItems: [anOrderItem()],
          user: aUser({ email: 'buyer@nexus.test' }),
        }) as never,
      );

      const result = await payments.confirmPayment('user-1', CONFIRM);
      await flushPendingEmails();

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(PaymentStatus.COMPLETED);
      expect(mail.send).not.toHaveBeenCalled();
      // The order was already moved on by whoever won the claim.
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('refuses an intent that collected less than the order is worth', async () => {
      givenPendingPayment({ amount: money(108) });
      // A vnd intent for the same number: 10,800 VND instead of $108.
      stripe.paymentIntents.retrieve.mockResolvedValue(
        anIntent({ amount: 10800, currency: 'vnd' }),
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        'The amount collected does not match this order',
      );
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('refuses an intent whose amount does not match the payment row', async () => {
      givenPendingPayment({ amount: money(108) });
      stripe.paymentIntents.retrieve.mockResolvedValue(
        anIntent({ amount: 100, currency: 'usd' }),
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        'The amount collected does not match this order',
      );
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('emails the order confirmation once the order is fulfilled', async () => {
      givenPendingPayment({}, {});
      prisma.order.findUnique.mockResolvedValue(
        anOrder({
          orderNumber: 'ORD-42',
          orderItems: [anOrderItem()],
          user: aUser({ email: 'buyer@nexus.test' }),
        }) as never,
      );

      await payments.confirmPayment('user-1', CONFIRM);
      await flushPendingEmails();

      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'buyer@nexus.test' }),
      );
    });

    it('sends no confirmation email when the order was already cancelled', async () => {
      givenPendingPayment({}, {});
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });
      prisma.order.findUnique.mockResolvedValue(
        anOrder({
          orderNumber: 'ORD-42',
          status: OrderStatus.CANCELLED,
          orderItems: [anOrderItem()],
          user: aUser({ email: 'buyer@nexus.test' }),
        }) as never,
      );

      await expect(payments.confirmPayment('user-1', CONFIRM)).rejects.toThrow(
        ConflictException,
      );
      await flushPendingEmails();

      expect(mail.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Order ORD-42 confirmed' }),
      );
      // The buyer hears about the refund instead.
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Refund issued for order ORD-42',
        }),
      );
    });
  });

  describe('refund', () => {
    // The refund path is all about concurrent writes, so the mock emulates the
    // two things the database really enforces: the balance moves by increments,
    // and only an order still in PENDING/PROCESSING can be claimed for restock.
    const givenCompletedPayment = (
      paymentOver: Record<string, unknown> = {},
      orderOver: Record<string, unknown> = {},
    ) => {
      const payment = aPayment({
        status: PaymentStatus.COMPLETED,
        ...paymentOver,
      });
      let refunded = Number(payment.refundedAmount);
      let orderStatus = anOrder({
        status: OrderStatus.PROCESSING,
        ...orderOver,
      }).status as OrderStatus;

      prisma.payment.findUnique.mockResolvedValue(payment as never);

      (prisma.payment.update as unknown as jest.Mock).mockImplementation(
        (args: {
          data: Record<string, { increment?: number; decrement?: number }>;
        }) => {
          const written = args.data.refundedAmount;
          if (written && typeof written === 'object') {
            if (written.increment !== undefined) {
              refunded = Math.round((refunded + written.increment) * 100) / 100;
            }
            if (written.decrement !== undefined) {
              refunded = Math.round((refunded - written.decrement) * 100) / 100;
            }
          }
          return Promise.resolve({
            ...payment,
            ...args.data,
            refundedAmount: money(refunded),
          });
        },
      );

      (prisma.order.updateMany as unknown as jest.Mock).mockImplementation(
        (args: {
          where: { status?: { in?: OrderStatus[]; not?: OrderStatus } };
          data: { status: OrderStatus };
        }) => {
          const wanted = args.where.status ?? {};
          const matches = wanted.in
            ? wanted.in.includes(orderStatus)
            : orderStatus !== wanted.not;
          if (matches) orderStatus = args.data.status;
          return Promise.resolve({ count: matches ? 1 : 0 });
        },
      );

      prisma.orderItem.findMany.mockResolvedValue([] as never);
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });

      return {
        payment,
        // Lets a test move the order while the Stripe call is in flight.
        setOrderStatus: (status: OrderStatus) => {
          orderStatus = status;
        },
        currentOrderStatus: () => orderStatus,
      };
    };

    // The refund is claimed against the balance before Stripe is called.
    const claimCall = () =>
      (prisma.payment.update as unknown as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };

    it('rejects a payment id that does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null as never);

      await expect(payments.refund('pay-404', {})).rejects.toThrow(
        'Payment with ID pay-404 not found',
      );
    });

    it('refuses to refund a payment that never completed', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...aPayment({ status: PaymentStatus.PENDING }),
        order: anOrder(),
      } as never);

      await expect(payments.refund('pay-1', {})).rejects.toThrow(
        'Only a completed payment can be refunded',
      );
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('refuses a payment with no Stripe transaction behind it', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...aPayment({
          status: PaymentStatus.COMPLETED,
          transactionId: null,
        }),
        order: anOrder(),
      } as never);

      await expect(payments.refund('pay-1', {})).rejects.toThrow(
        'This payment has no Stripe transaction to refund',
      );
    });

    it('refuses a payment that has already been refunded in full', async () => {
      givenCompletedPayment({
        amount: money(100),
        refundedAmount: money(100),
      });

      await expect(payments.refund('pay-1', {})).rejects.toThrow(
        'This payment has already been fully refunded',
      );
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('refuses to refund more than is left on the payment', async () => {
      givenCompletedPayment({
        amount: money(100),
        refundedAmount: money(40),
      });

      await expect(payments.refund('pay-1', { amount: 61 })).rejects.toThrow(
        'only $60.00 is left on this payment',
      );
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('allows refunding exactly what is left', async () => {
      givenCompletedPayment({
        amount: money(100),
        refundedAmount: money(40),
      });

      const result = await payments.refund('pay-1', { amount: 60 });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 6000 }),
        expect.objectContaining({ idempotencyKey: 'refund-pay-1-10000' }),
      );
      expect(result.message).toBe(
        'Payment fully refunded and the order cancelled',
      );
    });

    it('refunds everything outstanding when no amount is given', async () => {
      givenCompletedPayment({ amount: money(108) });

      await payments.refund('pay-1', {});

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_1',
          amount: 10800,
        }),
        expect.objectContaining({ idempotencyKey: 'refund-pay-1-10800' }),
      );
    });

    it('sends a partial refund to Stripe in whole cents', async () => {
      givenCompletedPayment({ amount: money(108) });

      await payments.refund('pay-1', { amount: 25.5 });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2550 }),
        expect.objectContaining({ idempotencyKey: 'refund-pay-1-2550' }),
      );
    });

    it('leaves a partially refunded payment completed and its order alive', async () => {
      givenCompletedPayment({ amount: money(108) });

      const result = await payments.refund('pay-1', { amount: 25.5 });

      expect(claimCall().data).toEqual({
        refundedAmount: { increment: 25.5 },
      });
      expect(lastCall(prisma.payment.update).data.status).toBeUndefined();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(result.message).toBe('Refunded $25.50; $82.50 remains');
    });

    it('adds to the refunded balance instead of overwriting it', async () => {
      givenCompletedPayment({
        amount: money(100),
        refundedAmount: money(30),
      });

      const result = await payments.refund('pay-1', { amount: 20 });

      // Writing an absolute 20 here would record $20 sent back when $50 has.
      expect(claimCall().data).toEqual({ refundedAmount: { increment: 20 } });
      expect(result.message).toBe('Refunded $20.00; $50.00 remains');
    });

    it('lets the database enforce the ceiling in the same statement as the write', async () => {
      givenCompletedPayment({
        amount: money(100),
        refundedAmount: money(30),
      });

      await payments.refund('pay-1', { amount: 20 });

      expect(claimCall().where).toEqual({
        id: 'pay-1',
        refundedAmount: { lte: 80 },
      });
    });

    it('refuses a refund the balance can no longer take', async () => {
      givenCompletedPayment({ amount: money(100) });
      // A concurrent refund landed first, so the ceiling in the WHERE clause
      // matches nothing and Prisma reports no such record.
      (prisma.payment.update as unknown as jest.Mock).mockRejectedValue(
        new Error('An operation failed because it depends on one or more'),
      );

      await expect(payments.refund('pay-1', { amount: 80 })).rejects.toThrow(
        'another refund on this payment got there first',
      );
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('marks the payment refunded once the partials add up to the full amount', async () => {
      givenCompletedPayment({
        amount: money(108),
        refundedAmount: money(80),
      });

      await payments.refund('pay-1', { amount: 28 });

      expect(claimCall().data).toEqual({ refundedAmount: { increment: 28 } });
      expect(lastCall(prisma.payment.update).data.status).toBe(
        PaymentStatus.REFUNDED,
      );
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        },
        data: { status: OrderStatus.CANCELLED },
      });
    });

    it('returns a plain product line to stock on a full refund', async () => {
      givenCompletedPayment({}, { status: OrderStatus.PROCESSING });
      prisma.orderItem.findMany.mockResolvedValue([
        anOrderItem({ productId: 'prod-1', variantId: null, quantity: 2 }),
      ] as never);

      await payments.refund('pay-1', {});

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('returns stock to the variant rather than the parent product', async () => {
      givenCompletedPayment({}, { status: OrderStatus.PENDING });
      prisma.orderItem.findMany.mockResolvedValue([
        anOrderItem({
          productId: aProduct().id,
          variantId: aVariant().id,
          quantity: 3,
        }),
      ] as never);

      await payments.refund('pay-1', {});

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { stock: { increment: 3 } },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('cancels but does not restock an order that has already shipped', async () => {
      const order = givenCompletedPayment({}, { status: OrderStatus.SHIPPED });

      await payments.refund('pay-1', {});

      expect(prisma.order.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'order-1', status: { not: OrderStatus.CANCELLED } },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(order.currentOrderStatus()).toBe(OrderStatus.CANCELLED);
      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('does not restock twice when the order was already cancelled', async () => {
      givenCompletedPayment({}, { status: OrderStatus.CANCELLED });

      await payments.refund('pay-1', {});

      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(lastCall(prisma.payment.update).data.status).toBe(
        PaymentStatus.REFUNDED,
      );
    });

    it('does not restock an order that was cancelled while Stripe was working', async () => {
      const order = givenCompletedPayment(
        {},
        { status: OrderStatus.PROCESSING },
      );
      prisma.orderItem.findMany.mockResolvedValue([
        anOrderItem({ productId: 'prod-1', variantId: null, quantity: 4 }),
      ] as never);
      // Someone cancels the order — returning its stock — during the seconds
      // the refund call spends on the wire.
      stripe.refunds.create.mockImplementation(() => {
        order.setOrderStatus(OrderStatus.CANCELLED);
        return Promise.resolve({ id: 're_1' });
      });

      await payments.refund('pay-1', {});

      // A snapshot read before the call still says PROCESSING; the fresh row
      // says CANCELLED, so the units must not come back a second time.
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    });

    it('records the reason on the payment and passes it to Stripe', async () => {
      givenCompletedPayment({ amount: money(100) });

      await payments.refund('pay-1', {
        amount: 10,
        reason: 'Item arrived damaged',
      });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { orderId: 'order-1', reason: 'Item arrived damaged' },
        }),
        expect.anything(),
      );
      expect(lastCall(prisma.payment.update).data.refundReason).toBe(
        'Item arrived damaged',
      );
    });

    it('keeps the reason already on record when a later refund gives none', async () => {
      givenCompletedPayment({
        amount: money(100),
        refundedAmount: money(10),
        refundReason: 'Item arrived damaged',
      });

      await payments.refund('pay-1', { amount: 5 });

      expect(lastCall(prisma.payment.update).data.refundReason).toBe(
        'Item arrived damaged',
      );
    });

    it('gives the claimed balance back when Stripe rejects the refund', async () => {
      givenCompletedPayment({ amount: money(108) });
      stripe.refunds.create.mockRejectedValue(
        new Error('charge already refunded'),
      );

      await expect(payments.refund('pay-1', {})).rejects.toThrow(
        'Stripe refused the refund: charge already refunded',
      );

      // The claim taken before the call is released again, so the ledger never
      // shows a refund Stripe did not make.
      expect(lastCall(prisma.payment.update)).toEqual({
        where: { id: 'pay-1' },
        data: { refundedAmount: { decrement: 108 } },
      });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    });

    it('emails the customer that a refund was issued', async () => {
      givenCompletedPayment({ amount: money(100) });
      prisma.order.findUnique.mockResolvedValue(
        anOrder({
          orderNumber: 'ORD-42',
          user: aUser({ email: 'buyer@nexus.test' }),
        }) as never,
      );

      await payments.refund('pay-1', { amount: 10 });
      await flushPendingEmails();

      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'buyer@nexus.test',
          subject: 'Refund issued for order ORD-42',
        }),
      );
    });
  });

  describe('handleStripeEvent', () => {
    const givenEvent = (event: Record<string, unknown>) => {
      stripe.webhooks.constructEvent.mockReturnValue(event);
    };

    it('refuses to process webhooks when no signing secret is configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      await expect(
        payments.handleStripeEvent(RAW_BODY, SIGNATURE),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('rejects a webhook delivered without a raw body', async () => {
      await expect(
        payments.handleStripeEvent(undefined, SIGNATURE),
      ).rejects.toThrow('Missing raw request body');
    });

    it('rejects a webhook delivered without a signature header', async () => {
      await expect(
        payments.handleStripeEvent(RAW_BODY, undefined),
      ).rejects.toThrow('Missing stripe-signature header');
    });

    it('rejects a webhook whose signature does not verify', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(
        payments.handleStripeEvent(RAW_BODY, SIGNATURE),
      ).rejects.toThrow('Webhook signature verification failed');
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('verifies the signature against the raw body and the configured secret', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_configured';
      givenEvent({ type: 'invoice.paid', data: { object: {} } });

      await payments.handleStripeEvent(RAW_BODY, SIGNATURE);

      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        RAW_BODY,
        SIGNATURE,
        'whsec_configured',
      );
    });

    it('acknowledges an event type it does not handle without touching the database', async () => {
      givenEvent({ type: 'customer.created', data: { object: {} } });

      await expect(
        payments.handleStripeEvent(RAW_BODY, SIGNATURE),
      ).resolves.toEqual({ received: true });
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('routes payment_intent.succeeded to fulfilment', async () => {
      givenEvent({
        type: 'payment_intent.succeeded',
        data: { object: anIntent() },
      });
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);
      prisma.order.findUnique.mockResolvedValue(anOrder() as never);
      prisma.payment.updateMany.mockResolvedValue({ count: 1 } as never);

      await expect(
        payments.handleStripeEvent(RAW_BODY, SIGNATURE),
      ).resolves.toEqual({ received: true });

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: { not: PaymentStatus.COMPLETED } },
        data: { status: PaymentStatus.COMPLETED },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PROCESSING },
      });
    });

    it('routes payment_intent.payment_failed to the failure handler', async () => {
      givenEvent({
        type: 'payment_intent.payment_failed',
        data: { object: anIntent({ status: 'requires_payment_method' }) },
      });
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);

      await payments.handleStripeEvent(RAW_BODY, SIGNATURE);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('routes charge.refunded to the refund handler', async () => {
      givenEvent({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_1', amount_refunded: 2500 } },
      });
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ amount: money(108) }) as never,
      );

      await payments.handleStripeEvent(RAW_BODY, SIGNATURE);

      expect(lastCall(prisma.payment.update).data.refundedAmount).toBe(25);
    });

    it('does not fulfil an intent that collected the wrong amount', async () => {
      givenEvent({
        type: 'payment_intent.succeeded',
        // A vnd intent for a usd payment row: 10,800 VND, not $108.
        data: { object: anIntent({ amount: 10800, currency: 'vnd' }) },
      });
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ amount: money(108) }) as never,
      );

      await expect(
        payments.handleStripeEvent(RAW_BODY, SIGNATURE),
      ).resolves.toEqual({ received: true });

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('payment_intent.succeeded handling', () => {
    const fireSucceeded = async (intent: Record<string, unknown> = {}) => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: anIntent(intent) },
      });
      return payments.handleStripeEvent(RAW_BODY, SIGNATURE);
    };

    it('finds the local payment by the intent id', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await fireSucceeded({ id: 'pi_lookup' });

      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { transactionId: 'pi_lookup' },
      });
    });

    it('ignores an intent with no local payment behind it', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await expect(fireSucceeded()).resolves.toEqual({ received: true });
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('does not fulfil a second time when the payment is already completed', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.COMPLETED }) as never,
      );

      await fireSucceeded();

      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('checks out the cart behind the order it fulfils', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);
      prisma.order.findUnique.mockResolvedValue(
        anOrder({ cartId: 'cart-9' }) as never,
      );
      prisma.payment.updateMany.mockResolvedValue({ count: 1 } as never);

      await fireSucceeded();

      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-9' },
        data: { checkedOut: true },
      });
    });

    it('refunds a charge that landed on an order the cron already cancelled', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);
      prisma.order.findUnique.mockResolvedValue(
        anOrder({ status: OrderStatus.CANCELLED }) as never,
      );
      prisma.payment.update.mockResolvedValue(
        aPayment({ status: PaymentStatus.REFUNDED }) as never,
      );
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });

      await fireSucceeded();

      // Never COMPLETED: the money is going back, not into revenue.
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_1' }),
        expect.objectContaining({
          idempotencyKey: 'cancelled-order-refund-pay-1',
        }),
      );
      expect(lastCall(prisma.payment.update).data.status).toBe(
        PaymentStatus.REFUNDED,
      );
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('emails the confirmation only once when confirm and webhook race', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);
      prisma.order.findUnique.mockResolvedValue(
        anOrder({
          orderItems: [anOrderItem()],
          user: aUser({ email: 'buyer@nexus.test' }),
        }) as never,
      );
      // The browser confirm won the claim moments earlier.
      prisma.payment.updateMany.mockResolvedValue({ count: 0 } as never);

      await fireSucceeded();
      await flushPendingEmails();

      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('payment_intent.payment_failed handling', () => {
    const fireFailed = async (intent: Record<string, unknown> = {}) => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: {
          object: anIntent({
            status: 'requires_payment_method',
            last_payment_error: { message: 'card_declined' },
            ...intent,
          }),
        },
      });
      return payments.handleStripeEvent(RAW_BODY, SIGNATURE);
    };

    it('marks a pending payment as failed', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);

      await fireFailed();

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('never downgrades a payment that already completed', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ status: PaymentStatus.COMPLETED }) as never,
      );

      await fireFailed();

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('ignores a failure for an intent it has no record of', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await expect(fireFailed()).resolves.toEqual({ received: true });
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('charge.refunded handling', () => {
    const fireRefunded = async (charge: Record<string, unknown>) => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: charge },
      });
      return payments.handleStripeEvent(RAW_BODY, SIGNATURE);
    };

    it('ignores a charge that carries no payment intent', async () => {
      await fireRefunded({ payment_intent: null, amount_refunded: 5000 });

      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('reads the intent id from an expanded payment_intent object', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await fireRefunded({
        payment_intent: { id: 'pi_expanded' },
        amount_refunded: 5000,
      });

      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { transactionId: 'pi_expanded' },
      });
    });

    it('ignores a charge with no local payment behind it', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await fireRefunded({ payment_intent: 'pi_1', amount_refunded: 5000 });

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('records a partial refund raised in the Stripe dashboard', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({
          amount: money(108),
          status: PaymentStatus.COMPLETED,
        }) as never,
      );

      await fireRefunded({ payment_intent: 'pi_1', amount_refunded: 2550 });

      const { data } = lastCall(prisma.payment.update);
      expect(data.refundedAmount).toBe(25.5);
      expect(data.status).toBeUndefined();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('cancels the order when Stripe reports the charge fully refunded', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({
          amount: money(108),
          status: PaymentStatus.COMPLETED,
        }) as never,
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.orderItem.findMany.mockResolvedValue([] as never);

      await fireRefunded({ payment_intent: 'pi_1', amount_refunded: 10800 });

      expect(lastCall(prisma.payment.update).data.status).toBe(
        PaymentStatus.REFUNDED,
      );
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        },
        data: { status: OrderStatus.CANCELLED },
      });
    });

    it('returns the stock of an order refunded from the Stripe dashboard', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({
          amount: money(108),
          status: PaymentStatus.COMPLETED,
        }) as never,
      );
      prisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.orderItem.findMany.mockResolvedValue([
        anOrderItem({ productId: 'prod-1', variantId: null, quantity: 3 }),
        anOrderItem({ productId: 'prod-1', variantId: 'var-1', quantity: 2 }),
      ] as never);

      await fireRefunded({ payment_intent: 'pi_1', amount_refunded: 10800 });

      // Without this the units are lost: the order can never be cancelled
      // again and no later refund would put them back.
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 3 } },
      });
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { stock: { increment: 2 } },
      });
    });

    it('does not restock an order that was already cancelled', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({
          amount: money(108),
          status: PaymentStatus.COMPLETED,
        }) as never,
      );
      // Neither the PENDING/PROCESSING claim nor the fallback matches.
      prisma.order.updateMany.mockResolvedValue({ count: 0 } as never);

      await fireRefunded({ payment_intent: 'pi_1', amount_refunded: 10800 });

      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('ignores the echo of a refund the admin panel already recorded', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({
          amount: money(108),
          refundedAmount: money(25.5),
          status: PaymentStatus.COMPLETED,
        }) as never,
      );

      await fireRefunded({ payment_intent: 'pi_1', amount_refunded: 2550 });

      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lists only the caller own payments, newest first', async () => {
      prisma.payment.findMany.mockResolvedValue([aPayment()] as never);

      await payments.findAll('user-1');

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns an empty list for a user who has never paid', async () => {
      prisma.payment.findMany.mockResolvedValue([] as never);

      const result = await payments.findAll('user-1');

      expect(result.data).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('exposes every amount as a number', async () => {
      prisma.payment.findMany.mockResolvedValue([
        aPayment({ id: 'pay-1', amount: money(10.5) }),
        aPayment({ id: 'pay-2', amount: money(99.99) }),
      ] as never);

      const result = await payments.findAll('user-1');

      expect(result.data.map((p) => p.amount)).toEqual([10.5, 99.99]);
    });
  });

  describe('findOne', () => {
    it('hides a payment that belongs to someone else', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      await expect(payments.findOne('pay-1', 'intruder')).rejects.toThrow(
        'Payment with ID pay-1 not found',
      );

      // The id alone must never be enough to read a payment.
      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { id: 'pay-1', userId: 'intruder' },
      });
    });

    it('returns the payment when the caller owns it', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ amount: money(108), transactionId: 'pi_1' }) as never,
      );

      const result = await payments.findOne('pay-1', 'user-1');

      expect(result.data).toMatchObject({
        id: 'pay-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 108,
        currency: 'usd',
        transactionId: 'pi_1',
      });
    });
  });

  describe('findByOrder', () => {
    it('scopes the order lookup to the caller', async () => {
      prisma.payment.findFirst.mockResolvedValue(aPayment() as never);

      await payments.findByOrder('order-1', 'user-1');

      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { orderId: 'order-1', userId: 'user-1' },
      });
    });

    it('returns null instead of throwing when the order has no payment yet', async () => {
      prisma.payment.findFirst.mockResolvedValue(null as never);

      const result = await payments.findByOrder('order-1', 'user-1');

      expect(result).toEqual({
        success: true,
        data: null,
        message: 'Payment retrieved successfully',
      });
    });

    it('returns the payment attached to the order', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        aPayment({ id: 'pay-7', amount: money(55.25) }) as never,
      );

      const result = await payments.findByOrder('order-1', 'user-1');

      expect(result.data).toMatchObject({ id: 'pay-7', amount: 55.25 });
    });
  });
});
