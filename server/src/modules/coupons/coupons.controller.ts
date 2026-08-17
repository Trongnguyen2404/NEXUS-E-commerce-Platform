import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CouponsService } from '@/modules/coupons/coupons.service';
import {
  CouponResponseDto,
  CreateCouponDto,
  UpdateCouponDto,
} from '@/modules/coupons/dto/coupon.dto';
import {
  ModerateThrottle,
  RelaxedThrottle,
} from '@/common/decorators/custom-throttler.decorator';

/**
 * Admin-only. Customers never list coupons — they type a code at checkout and
 * the pricing service validates it. Exposing the catalogue would hand out every
 * unused promo code.
 */
@ApiTags('coupons')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @RelaxedThrottle()
  @ApiOperation({ summary: '[ADMIN] List all coupons' })
  @ApiOkResponse({ type: [CouponResponseDto] })
  async findAll() {
    return await this.couponsService.findAll();
  }

  @Post()
  @ModerateThrottle()
  @ApiOperation({ summary: '[ADMIN] Create a coupon' })
  @ApiCreatedResponse({ type: CouponResponseDto })
  @ApiConflictResponse({ description: 'Code already exists' })
  async create(@Body() dto: CreateCouponDto) {
    return await this.couponsService.create(dto);
  }

  @Patch(':id')
  @ModerateThrottle()
  @ApiOperation({ summary: '[ADMIN] Update a coupon' })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiOkResponse({ type: CouponResponseDto })
  @ApiNotFoundResponse({ description: 'Coupon not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return await this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @ModerateThrottle()
  @ApiOperation({
    summary: '[ADMIN] Delete a coupon',
    description:
      'A coupon already used on an order is deactivated instead, so past orders keep their explanation.',
  })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiOkResponse({ description: 'Deleted or deactivated' })
  @ApiNotFoundResponse({ description: 'Coupon not found' })
  async remove(@Param('id') id: string) {
    return await this.couponsService.remove(id);
  }
}
