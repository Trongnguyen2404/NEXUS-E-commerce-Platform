import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RefundPaymentDto } from '@/modules/payments/dto/refund-payment.dto';
import { PaymentsService } from '@/modules/payments/payments.service';
import { CreatePaymentIntentDto } from '@/modules/payments/dto/create-payment-intent.dto';
import { GetUser } from '@/common/decorators/get-user.decorator';
import {
  CreatePaymentIntentApiResponseDto,
  PaymentApiResponseDto,
} from '@/modules/payments/dto/payment-response.dto';
import { ConfirmPaymentDto } from '@/modules/payments/dto/confirm-payment.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiTags('payments')
@ApiBearerAuth('JWT-auth')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  @ApiOperation({
    summary: 'create payment intent',
    description: 'Create a payment intent for an order',
  })
  @ApiCreatedResponse({
    description: 'Payment intent created successfully',
    type: CreatePaymentIntentApiResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'invalid data or order not found',
  })
  async createPaymentIntent(
    @Body() createPaymentIntentDto: CreatePaymentIntentDto,
    @GetUser('id') userId: string,
  ) {
    return await this.paymentsService.createPaymentIntent(
      userId,
      createPaymentIntentDto,
    );
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm payment',
    description: 'Confirm a payment intent for an order',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully',
    type: PaymentApiResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payment not found or already completed',
  })
  async confirmPayment(
    @Body() confirmPaymentDto: ConfirmPaymentDto,
    @GetUser('id') userId: string,
  ) {
    return await this.paymentsService.confirmPayment(userId, confirmPaymentDto);
  }

  @Post('admin/:id/refund')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Refund a payment',
    description:
      'Sends money back through Stripe. Omit `amount` for a full refund, which also cancels the order and — only if it has not shipped — returns the stock.',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiOkResponse({
    description: 'Refund issued',
    type: PaymentApiResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Payment is not refundable, or the amount exceeds what is left',
  })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  async refund(
    @Param('id') id: string,
    @Body() refundPaymentDto: RefundPaymentDto,
  ) {
    return await this.paymentsService.refund(id, refundPaymentDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all payments',
    description: 'Get all payments for the current user',
  })
  @ApiOkResponse({
    description: 'Payments retrieved successfully',
    type: PaymentApiResponseDto,
  })
  async findAll(@GetUser('id') userId: string) {
    return await this.paymentsService.findAll(userId);
  }

  @Get(':id')
  @ApiParam({
    name: 'id',
    description: 'Payment ID',
    example: '154sd4848ds5d-4654-4sdd8s7d-sd4656',
  })
  @ApiOperation({
    summary: 'Get payment by ID',
    description: 'Get a specific payment by its ID',
  })
  @ApiOkResponse({
    description: 'Payment retrieved successfully',
    type: PaymentApiResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Payment not found',
  })
  async findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.paymentsService.findOne(id, userId);
  }

  // Get payment by order ID
  @Get('order/:orderId')
  @ApiParam({
    name: 'orderId',
    description: 'Order ID',
    example: 'order-123',
  })
  @ApiOperation({
    summary: 'Get payment by order ID',
    description: 'Get payment information for a specific order',
  })
  @ApiOkResponse({
    description: 'Payment retrieved successfully',
    type: PaymentApiResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Payment not found',
  })
  async findByOrder(
    @Param('orderId') orderId: string,
    @GetUser('id') userId: string,
  ) {
    return await this.paymentsService.findByOrder(orderId, userId);
  }
}
