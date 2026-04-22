import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';
import { CreatePaymentIntentDto } from '@/modules/payments/dto/create-payment-intent.dto';
import { PaymentStatus, Prisma } from '@prisma/client';
import { ConfirmPaymentDto } from '@/modules/payments/dto/confirm-payment.dto';
import { PaymentResponseDto } from '@/modules/payments/dto/payment-response.dto';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;

  constructor(private prisma: PrismaService) {
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

    // 1. Zero-Trust: Tìm đơn hàng và lấy tổng tiền trực tiếp từ Database
    const order = await this.prisma.order.findFirst({
      where: { 
        id: orderId, 
        userId: userId // Đảm bảo người dùng chỉ có thể thanh toán đơn hàng của chính mình
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID ${orderId}`);
    }

    // 2. Kiểm tra xem đơn hàng đã được thanh toán trước đó chưa
    const existingPayment = await this.prisma.payment.findFirst({
      where: { orderId },
    });

    if (existingPayment && existingPayment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Đơn hàng này đã được thanh toán thành công trước đó');
    }

    // 3. Tính toán số tiền theo đơn vị nhỏ nhất (cents cho USD) để tránh sai số dấu phẩy động
    // Chuyển Decimal từ Prisma sang number và nhân với 100
    const amountInCents = Math.round(Number(order.totalAmount) * 100);

    try {
      // 4. Tạo Payment Intent phía Stripe
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency,
        metadata: { 
          orderId: order.id, 
          userId: userId 
        },
        description: createPaymentIntentDto.description || `Thanh toán đơn hàng #${order.id}`,
      });

      // 5. Lưu thông tin thanh toán vào Database với trạng thái PENDING
      // Nếu đã có bản ghi payment cũ (bị lỗi hoặc pending), ta cập nhật, nếu chưa thì tạo mới
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

  // Confirm payment intent
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

    const [updatedPayment] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.COMPLETED },
      }),

      this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' },
      }),
    ]);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
      },
    });

    if (order?.cartId) {
      await this.prisma.cart.update({
        where: { id: order.cartId },
        data: { checkedOut: true },
      });
    }

    return {
      success: true,
      data: this.mapToPaymentResponse(updatedPayment),
      message: ' Payment confirmed successfully',
    };
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
