import {
  BadRequestException,
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

  // Create payment intent
  async createPaymentIntent(
    userId: string,
    createPaymentIntentDto: CreatePaymentIntentDto,
  ): Promise<{
    success: boolean;
    data: { clientSecret: string; paymentId: string };
    message: string;
  }> {
    const { orderId, currency = 'usd' } = createPaymentIntentDto;

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId,
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID ${orderId}`);
    }

    const existingPayment = await this.prisma.payment.findFirst({
      where: { orderId },
    });

    if (existingPayment && existingPayment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException(
        'Đơn hàng này đã được thanh toán thành công trước đó',
      );
    }

    const amountInCents = Math.round(Number(order.totalAmount) * 100);

    try {
      // 4. Tạo Payment Intent phía Stripe
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
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
      // Xử lý lỗi từ phía Stripe hoặc Database
      throw new BadRequestException(`Lỗi khi tạo thanh toán: ${error.message}`);
    }
  }

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

    const updatedPayment = await this.fulfillOrder(payment.id, orderId);

    return {
      success: true,
      data: this.mapToPaymentResponse(updatedPayment),
      message: ' Payment confirmed successfully',
    };
  }

  /**
   * Sends money back through Stripe, then reflects it locally.
   *
   * Stripe is called FIRST and the database updated after: if the order were
   * flipped to refunded before the card was actually credited, a Stripe failure
   * would leave the shop believing it had paid the customer when it had not.
   * The reverse (Stripe succeeds, our write fails) is recoverable — the webhook
   * reconciles it.
   */
  async refund(
    paymentId: string,
    dto: RefundPaymentDto,
  ): Promise<{ success: boolean; data: PaymentResponseDto; message: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
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

    const alreadyRefunded = Number(payment.refundedAmount);
    const outstanding =
      Math.round((Number(payment.amount) - alreadyRefunded) * 100) / 100;

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

    try {
      await this.stripe.refunds.create({
        payment_intent: payment.transactionId,
        amount: Math.round(amount * 100),
        metadata: { orderId: payment.orderId, reason: dto.reason ?? '' },
      });
    } catch (error) {
      throw new BadRequestException(
        `Stripe refused the refund: ${error.message}`,
      );
    }

    const totalRefunded = Math.round((alreadyRefunded + amount) * 100) / 100;
    const isFullRefund = totalRefunded >= Number(payment.amount);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedAmount: totalRefunded,
          refundedAt: new Date(),
          refundReason: dto.reason ?? payment.refundReason,
          // A partial refund leaves the payment COMPLETED — part of the money
          // is still legitimately ours.
          ...(isFullRefund ? { status: PaymentStatus.REFUNDED } : {}),
        },
      });

      if (isFullRefund && payment.order.status !== OrderStatus.CANCELLED) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.CANCELLED },
        });

        // Stock only comes back if the goods never left. Once an order is
        // SHIPPED or DELIVERED the units are gone, and crediting them back
        // would let the shop oversell.
        if (
          payment.order.status === OrderStatus.PENDING ||
          payment.order.status === OrderStatus.PROCESSING
        ) {
          const items = await tx.orderItem.findMany({
            where: { orderId: payment.orderId },
          });

          for (const item of items) {
            // Variant lines return their units to the variant, not the product.
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
        : `Refunded $${amount.toFixed(2)}; $${(outstanding - amount).toFixed(2)} remains`,
    };
  }

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

  /**
   * Stripe webhook entry point. This — not the browser calling /confirm — is the
   * source of truth for whether an order was paid: the customer can close the tab
   * the moment the card is charged, and Stripe still delivers (and retries) here.
   */
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
      // Anyone can POST here, so an unverifiable payload is simply rejected.
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

      // Fires for refunds issued straight from the Stripe dashboard, which
      // never touch our refund endpoint. Without this the shop would keep
      // showing the order as paid.
      case 'charge.refunded':
        await this.onChargeRefunded(event.data.object);
        break;

      default:
        this.logger.log(`Ignoring unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  private async onPaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: paymentIntent.id },
    });

    if (!payment) {
      // Most likely an intent from another environment sharing the same Stripe
      // account. Acknowledge it so Stripe stops retrying.
      this.logger.warn(
        `No local payment for intent ${paymentIntent.id} — ignoring`,
      );
      return;
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return; // Already fulfilled, either by /confirm or an earlier delivery.
    }

    await this.fulfillOrder(payment.id, payment.orderId);
    this.logger.log(`Order ${payment.orderId} fulfilled via Stripe webhook`);
  }

  /** Reconciles a refund made outside the app (Stripe dashboard, disputes). */
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

    // Stripe reports the authoritative running total in minor units.
    const refunded = Math.round((charge.amount_refunded / 100) * 100) / 100;
    if (refunded <= Number(payment.refundedAmount)) return; // Already recorded.

    const isFullRefund = refunded >= Number(payment.amount);

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: refunded,
        refundedAt: new Date(),
        ...(isFullRefund ? { status: PaymentStatus.REFUNDED } : {}),
      },
    });

    if (isFullRefund) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.CANCELLED },
      });
    }

    this.logger.warn(
      `Refund of $${refunded.toFixed(2)} on order ${payment.orderId} came from Stripe, not the admin panel`,
    );
  }

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

  /**
   * Marks the payment complete and moves the order along. Safe to call twice —
   * both the webhook and /confirm can reach it for the same payment.
   */
  private async fulfillOrder(
    paymentId: string,
    orderId: string,
  ): Promise<Payment> {
    const { payment, wasFulfilled } = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });

        if (!order) {
          throw new NotFoundException(`Order with ID ${orderId} not found`);
        }

        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.COMPLETED },
        });

        if (order.status === OrderStatus.CANCELLED) {
          // The customer was charged for an order we already released. Recorded as
          // paid so it surfaces in the admin list and can be refunded manually.
          this.logger.error(
            `Order ${orderId} was CANCELLED before payment ${paymentId} succeeded — the customer was charged and needs a refund.`,
          );
          // Explicitly NOT fulfilled: sending "thanks for your order" here would
          // promise a delivery that is never coming.
          return { payment: updatedPayment, wasFulfilled: false };
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

        return { payment: updatedPayment, wasFulfilled: true };
      },
    );

    if (wasFulfilled) {
      // Sent after the transaction commits, and deliberately not awaited into
      // the transaction: a slow SMTP server must never hold a database lock,
      // and a bounced email must never roll back a paid order.
      void this.sendOrderConfirmation(orderId);
    }

    return payment;
  }

  /** Best-effort confirmation email. Never throws into the payment path. */
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

  // Get all payments for current user
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

  // Get payment by ID
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

  // Get payment by Order ID
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
