import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';
import { CreatePaymentIntentDto } from '@/modules/payments/dto/create-payment-intent.dto';
import { OrderStatus, Payment, PaymentStatus, Prisma } from '@prisma/client';
import { ConfirmPaymentDto } from '@/modules/payments/dto/confirm-payment.dto';
import { PaymentResponseDto } from '@/modules/payments/dto/payment-response.dto';
import { MailService } from '@/modules/mail/mail.service';
import {
  orderConfirmationEmail,
  refundIssuedEmail,
} from '@/modules/mail/mail.templates';
import { RefundPaymentDto } from '@/modules/payments/dto/refund-payment.dto';
import { frontendUrl } from '@/modules/auth/auth.constants';

// Currencies Stripe holds in whole units instead of hundredths.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

// The one currency the catalogue is priced in. It is deliberately not something
// the client can choose: order totals are computed in this currency, so charging
// the same number in another one either overcharges or — for a zero-decimal
// currency like vnd — collects a fraction of the total.
const storeCurrency = (): string =>
  (process.env.PAYMENT_CURRENCY ?? 'usd').toLowerCase();

// Stripe works in minor units, and how many there are per unit depends on the
// currency; a flat x100 silently divides a vnd total by a hundred.
const toMinorUnits = (amount: number, currency: string): number =>
  ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(amount)
    : Math.round(amount * 100);

const fromMinorUnits = (minorUnits: number, currency: string): number =>
  ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(minorUnits)
    : Math.round(minorUnits) / 100;

// Rounds an intermediate money value through cents so IEEE 754 drift never
// reaches a comparison or the database.
const cents = (amount: number): number => Math.round(amount * 100) / 100;

// Stripe integration: intents, confirmation, refunds and webhook handling.
@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    });
  }

  // Opens a Stripe payment intent for an unpaid order.
  async createPaymentIntent(
    userId: string,
    createPaymentIntentDto: CreatePaymentIntentDto,
  ): Promise<{
    success: boolean;
    data: { clientSecret: string; paymentId: string };
    message: string;
  }> {
    const { orderId } = createPaymentIntentDto;

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId,
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID ${orderId}`);
    }

    // Only a PENDING order is payable. A cancelled one — the expiry cron gets
    // there after an hour — has already had its stock returned, so an intent
    // opened against it would take money for goods nobody will ship.
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Đơn hàng này không còn ở trạng thái chờ thanh toán (${order.status})`,
      );
    }

    const existingPayment = await this.prisma.payment.findFirst({
      where: { orderId },
    });

    if (existingPayment && existingPayment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException(
        'Đơn hàng này đã được thanh toán thành công trước đó',
      );
    }

    // The refund figures on the row describe the charge that was sent back.
    // Pointing the same row at a new intent would leave them describing money
    // that never belonged to it, and the new charge could never be refunded.
    if (existingPayment && existingPayment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException(
        'Đơn hàng này đã được hoàn tiền, không thể thanh toán lại',
      );
    }

    const currency = storeCurrency();
    const amountInMinorUnits = toMinorUnits(
      Number(order.totalAmount),
      currency,
    );

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInMinorUnits,
        currency: currency,
        metadata: {
          orderId: order.id,
          userId: userId,
        },
        description:
          createPaymentIntentDto.description ||
          `Thanh toán đơn hàng #${order.id}`,
      });

      const payment = await this.prisma.payment.upsert({
        where: { orderId: order.id },
        update: {
          status: PaymentStatus.PENDING,
          transactionId: paymentIntent.id,
          amount: order.totalAmount,
          // The row is being repointed at a brand-new charge, so the currency
          // and every refund figure from the previous attempt must go with it.
          currency: currency,
          refundedAmount: 0,
          refundedAt: null,
          refundReason: null,
        },
        create: {
          orderId: order.id,
          userId: userId,
          amount: order.totalAmount,
          currency: currency,
          status: PaymentStatus.PENDING,
          paymentMethod: 'STRIPE',
          transactionId: paymentIntent.id,
        },
      });

      return {
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret!,
          paymentId: payment.id,
        },
        message: 'Tạo yêu cầu thanh toán thành công',
      };
    } catch (error) {
      throw new BadRequestException(`Lỗi khi tạo thanh toán: ${error.message}`);
    }
  }

  // Verifies the intent succeeded, then fulfils the order.
  async confirmPayment(
    userId: string,
    confirmPaymentDto: ConfirmPaymentDto,
  ): Promise<{ success: boolean; data: PaymentResponseDto; message: string }> {
    const { paymentIntentId, orderId } = confirmPaymentDto;

    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        userId,
        transactionId: paymentIntentId,
      },
    });

    if (!payment) {
      throw new NotFoundException('payment not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Payment already completed ');
    }

    const paymentIntent =
      await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException('Payment not successful');
    }

    if (!this.intentMatchesPayment(paymentIntent, payment)) {
      throw new BadRequestException(
        'The amount collected does not match this order',
      );
    }

    const {
      payment: updatedPayment,
      wasFulfilled,
      orderCancelled,
    } = await this.fulfillOrder(payment);

    // The money is already captured, so the buyer must be told rather than shown
    // a success screen for an order that will never ship.
    if (orderCancelled) {
      throw new ConflictException(
        'This order was cancelled before your payment completed; the charge has been refunded',
      );
    }

    return {
      success: true,
      data: this.mapToPaymentResponse(updatedPayment),
      message: wasFulfilled
        ? ' Payment confirmed successfully'
        : 'Payment was already confirmed',
    };
  }

  // True when Stripe collected exactly what this payment row promises.
  private intentMatchesPayment(
    intent: Stripe.PaymentIntent,
    payment: Payment,
  ): boolean {
    const expected = toMinorUnits(Number(payment.amount), payment.currency);

    if (intent.amount === expected && intent.currency === payment.currency) {
      return true;
    }

    this.logger.error(
      `Intent ${intent.id} collected ${intent.amount} ${intent.currency} but payment ${payment.id} expects ${expected} ${payment.currency} — not fulfilling`,
    );
    return false;
  }

  // Refunds a payment in full or in part and restocks the order.
  async refund(
    paymentId: string,
    dto: RefundPaymentDto,
  ): Promise<{ success: boolean; data: PaymentResponseDto; message: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${paymentId} not found`);
    }
    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only a completed payment can be refunded');
    }
    if (!payment.transactionId) {
      throw new BadRequestException(
        'This payment has no Stripe transaction to refund',
      );
    }

    const total = Number(payment.amount);
    const alreadyRefunded = Number(payment.refundedAmount);
    const outstanding = cents(total - alreadyRefunded);

    if (outstanding <= 0) {
      throw new BadRequestException(
        'This payment has already been fully refunded',
      );
    }

    const amount = dto.amount ?? outstanding;
    if (amount > outstanding) {
      throw new BadRequestException(
        `Cannot refund $${amount.toFixed(2)} — only $${outstanding.toFixed(2)} is left on this payment`,
      );
    }

    // Claim the money before Stripe is called, and let the database enforce the
    // ceiling in the same statement that adds to the balance. Reading the total,
    // checking it and writing it back as an absolute value lets two concurrent
    // refunds both pass a stale check and then record only one of the two.
    const claimed = await this.claimRefundAmount(paymentId, amount, total);
    const totalRefunded = Number(claimed.refundedAmount);
    const isFullRefund = totalRefunded >= total;

    try {
      await this.stripe.refunds.create(
        {
          payment_intent: payment.transactionId,
          amount: toMinorUnits(amount, payment.currency),
          metadata: { orderId: payment.orderId, reason: dto.reason ?? '' },
        },
        // Keyed on the balance this refund lands on, so an SDK-level network
        // retry cannot send the same money twice.
        {
          idempotencyKey: `refund-${paymentId}-${toMinorUnits(totalRefunded, payment.currency)}`,
        },
      );
    } catch (error) {
      // Nothing left the account, so hand the claimed balance back rather than
      // leaving a refund on record that Stripe never made.
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { refundedAmount: { decrement: amount } },
      });

      throw new BadRequestException(
        `Stripe refused the refund: ${error.message}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedAt: new Date(),
          refundReason: dto.reason ?? payment.refundReason,

          ...(isFullRefund ? { status: PaymentStatus.REFUNDED } : {}),
        },
      });

      if (isFullRefund) {
        await this.cancelAndRestock(tx, payment.orderId);
      }

      return updatedPayment;
    });

    this.logger.log(
      `Refunded $${amount.toFixed(2)} on payment ${paymentId} (order ${payment.orderId}); total refunded $${totalRefunded.toFixed(2)}`,
    );

    void this.sendRefundEmail(payment.orderId, amount, isFullRefund);

    return {
      success: true,
      data: this.mapToPaymentResponse(updated),
      message: isFullRefund
        ? 'Payment fully refunded and the order cancelled'
        : `Refunded $${amount.toFixed(2)}; $${cents(total - totalRefunded).toFixed(2)} remains`,
    };
  }

  // Adds to the refunded balance only if the payment can still take it. The
  // ceiling lives in the WHERE clause so the check and the write are one
  // statement the database serialises for us.
  private async claimRefundAmount(
    paymentId: string,
    amount: number,
    total: number,
  ): Promise<Payment> {
    try {
      return await this.prisma.payment.update({
        where: {
          id: paymentId,
          refundedAmount: { lte: cents(total - amount) },
        },
        data: { refundedAmount: { increment: amount } },
      });
    } catch {
      throw new BadRequestException(
        `Cannot refund $${amount.toFixed(2)} — another refund on this payment got there first`,
      );
    }
  }

  // Cancels an order and returns its stock exactly once, whichever refund route
  // asked for it. The fresh row inside the transaction decides, never a copy
  // read before a network call to Stripe.
  private async cancelAndRestock(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const claimed = await tx.order.updateMany({
      where: {
        id: orderId,
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
      },
      data: { status: OrderStatus.CANCELLED },
    });

    if (claimed.count === 0) {
      // Already cancelled, or shipped and therefore gone from the warehouse:
      // record the cancellation but do not invent stock.
      await tx.order.updateMany({
        where: { id: orderId, status: { not: OrderStatus.CANCELLED } },
        data: { status: OrderStatus.CANCELLED },
      });
      return;
    }

    // A refund releases the promo code the same way an admin cancel does.
    // Without this, a limited-use code stayed burned by an order that was
    // refunded, and the cancel path in OrdersService already gives it back —
    // two routes to the same end state disagreeing is what caused the leak.
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { couponId: true },
    });

    if (order?.couponId) {
      // Guarded so a double release can never drive the counter negative.
      await tx.$executeRaw`
        UPDATE coupons
        SET "usedCount" = GREATEST("usedCount" - 1, 0)
        WHERE id = ${order.couponId}
      `;
    }

    const items = await tx.orderItem.findMany({ where: { orderId } });

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

  // Emails the customer that a refund was issued.
  private async sendRefundEmail(
    orderId: string,
    amount: number,
    isFullRefund: boolean,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true },
      });
      if (!order?.user?.email) return;

      const template = refundIssuedEmail({
        orderNumber: order.orderNumber,
        amount,
        isFullRefund,
        orderUrl: `${frontendUrl()}/account`,
      });

      await this.mailService.send({ to: order.user.email, ...template });
    } catch (error) {
      this.logger.error(
        `Could not send refund email for order ${orderId}: ${error.message}`,
      );
    }
  }

  // Routes a verified Stripe webhook event to its handler.
  async handleStripeEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: boolean }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new InternalServerErrorException('Webhook is not configured');
    }
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.warn(`Rejected webhook: ${error.message}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await this.onPaymentIntentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await this.onChargeRefunded(event.data.object);
        break;

      default:
        this.logger.log(`Ignoring unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  // Handles the payment_intent.succeeded event.
  private async onPaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: paymentIntent.id },
    });

    if (!payment) {
      this.logger.warn(
        `No local payment for intent ${paymentIntent.id} — ignoring`,
      );
      return;
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return;
    }

    if (!this.intentMatchesPayment(paymentIntent, payment)) {
      return;
    }

    const { wasFulfilled, orderCancelled } = await this.fulfillOrder(payment);

    if (orderCancelled) {
      this.logger.warn(
        `Order ${payment.orderId} was cancelled before its charge landed — the payment was refunded, not banked`,
      );
      return;
    }

    if (wasFulfilled) {
      this.logger.log(`Order ${payment.orderId} fulfilled via Stripe webhook`);
    }
  }

  // Handles the charge.refunded event.
  private async onChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const intentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!intentId) return;

    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: intentId },
    });
    if (!payment) return;

    // charge.amount_refunded is the running total Stripe holds, so it replaces
    // our balance rather than adding to it.
    const refunded = fromMinorUnits(charge.amount_refunded, payment.currency);
    if (refunded <= Number(payment.refundedAmount)) return;

    const isFullRefund = refunded >= Number(payment.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: refunded,
          refundedAt: new Date(),
          ...(isFullRefund ? { status: PaymentStatus.REFUNDED } : {}),
        },
      });

      // A refund raised in the Stripe dashboard has to put the stock back too,
      // otherwise the units are lost with no route left to recover them.
      if (isFullRefund) {
        await this.cancelAndRestock(tx, payment.orderId);
      }
    });

    this.logger.warn(
      `Refund of $${refunded.toFixed(2)} on order ${payment.orderId} came from Stripe, not the admin panel`,
    );
  }

  // Handles the payment_intent.payment_failed event.
  private async onPaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: paymentIntent.id },
    });

    if (!payment || payment.status === PaymentStatus.COMPLETED) {
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
    this.logger.warn(
      `Payment ${payment.id} for order ${payment.orderId} failed: ${paymentIntent.last_payment_error?.message ?? 'unknown reason'}`,
    );
  }

  // Marks the order paid and records the payment, once.
  private async fulfillOrder(payment: Payment): Promise<{
    payment: Payment;
    wasFulfilled: boolean;
    orderCancelled: boolean;
  }> {
    const orderId = payment.orderId;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });

      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }

      // Money landed on an order that will never ship. Marking the payment
      // COMPLETED here would bank it into dashboard revenue and hide the
      // problem, so the row stays as it is and the charge goes back.
      if (order.status === OrderStatus.CANCELLED) {
        return { wasFulfilled: false, orderCancelled: true };
      }

      // The browser's confirm call and the Stripe webhook race each other.
      // Whoever moves the row out of "not yet COMPLETED" owns the fulfilment;
      // the loser must not send a second confirmation email. A plain update
      // has no such predicate, so both callers used to win.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.COMPLETED } },
        data: { status: PaymentStatus.COMPLETED },
      });

      if (claimed.count === 0) {
        return { wasFulfilled: false, orderCancelled: false };
      }

      if (order.status === OrderStatus.PENDING) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PROCESSING },
        });
      }

      if (order.cartId) {
        await tx.cart.update({
          where: { id: order.cartId },
          data: { checkedOut: true },
        });
      }

      return { wasFulfilled: true, orderCancelled: false };
    });

    if (outcome.orderCancelled) {
      return {
        payment: await this.refundUnfulfillableCharge(payment),
        wasFulfilled: false,
        orderCancelled: true,
      };
    }

    if (outcome.wasFulfilled) {
      void this.sendOrderConfirmation(orderId);
    }

    // Either this call completed the row or someone else already had.
    return {
      payment: { ...payment, status: PaymentStatus.COMPLETED },
      wasFulfilled: outcome.wasFulfilled,
      orderCancelled: false,
    };
  }

  // Sends back a charge collected against an order that was already cancelled.
  private async refundUnfulfillableCharge(payment: Payment): Promise<Payment> {
    const reason = 'Order was cancelled before the payment completed';

    this.logger.error(
      `Order ${payment.orderId} was CANCELLED before payment ${payment.id} succeeded — refunding the charge.`,
    );

    if (!payment.transactionId) {
      return payment;
    }

    try {
      await this.stripe.refunds.create(
        {
          payment_intent: payment.transactionId,
          metadata: { orderId: payment.orderId, reason },
        },
        { idempotencyKey: `cancelled-order-refund-${payment.id}` },
      );
    } catch (error) {
      this.logger.error(
        `Automatic refund of payment ${payment.id} failed: ${error.message} — it must be refunded by hand`,
      );
      return payment;
    }

    const refunded = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAmount: payment.amount,
        refundedAt: new Date(),
        refundReason: reason,
      },
    });

    void this.sendRefundEmail(payment.orderId, Number(payment.amount), true);

    return refunded;
  }

  // Emails the order confirmation.
  private async sendOrderConfirmation(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true, user: true },
      });

      if (!order?.user?.email) return;

      const template = orderConfirmationEmail({
        orderNumber: order.orderNumber,
        items: order.orderItems.map((item) => ({
          productName: item.productName,
          variantLabel: item.variantLabel,
          quantity: item.quantity,
          price: Number(item.price),
        })),
        total: Number(order.totalAmount),
        shippingAddress: order.shippingAddress ?? 'Not provided',
        orderUrl: `${frontendUrl()}/account`,
      });

      await this.mailService.send({ to: order.user.email, ...template });
    } catch (error) {
      this.logger.error(
        `Could not send confirmation email for order ${orderId}: ${error.message}`,
      );
    }
  }

  // Lists the caller's payments.
  async findAll(userId: string): Promise<{
    success: boolean;
    data: PaymentResponseDto[];
    message: string;
  }> {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: payments.map((payment) => this.mapToPaymentResponse(payment)),
      message: 'Payments retrieved successfully',
    };
  }

  // Loads one payment, scoped to its owner unless the caller is an admin.
  async findOne(
    id: string,
    userId: string,
  ): Promise<{
    success: boolean;
    data: PaymentResponseDto;
    message: string;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, userId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return {
      success: true,
      data: this.mapToPaymentResponse(payment),
      message: 'Payment retrieved successfully',
    };
  }

  // Loads the payment attached to an order.
  async findByOrder(
    orderId: string,
    userId: string,
  ): Promise<{
    success: boolean;
    data: PaymentResponseDto | null;
    message: string;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, userId },
    });

    return {
      success: true,
      data: payment ? this.mapToPaymentResponse(payment) : null,
      message: 'Payment retrieved successfully',
    };
  }

  // Shapes a payment row into its API response.
  private mapToPaymentResponse(payment: {
    id: string;
    orderId: string;
    userId: string;
    amount: Prisma.Decimal;
    currency: string;
    status: PaymentStatus;
    paymentMethod: string | null;
    transactionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentResponseDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      currency: payment.currency,
      amount: payment.amount.toNumber(),
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      transactionId: payment.transactionId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
