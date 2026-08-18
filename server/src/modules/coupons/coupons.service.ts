import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CouponResponseDto,
  CreateCouponDto,
  UpdateCouponDto,
} from '@/modules/coupons/dto/coupon.dto';

// Promo code reads and writes.
@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  // Lists every promo code, newest first.
  async findAll(): Promise<CouponResponseDto[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return coupons.map((coupon) => this.map(coupon));
  }

  // Creates a promo code, rejecting a code that already exists.
  async create(dto: CreateCouponDto): Promise<CouponResponseDto> {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Coupon code ${code} already exists`);
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        type: dto.type,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount ?? null,
        maxDiscount: dto.maxDiscount ?? null,
        maxUses: dto.maxUses ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.map(coupon);
  }

  // Updates a promo code.
  async update(id: string, dto: UpdateCouponDto): Promise<CouponResponseDto> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');

    const code = dto.code ? dto.code.trim().toUpperCase() : undefined;

    if (code && code !== existing.code) {
      const clash = await this.prisma.coupon.findUnique({ where: { code } });
      if (clash)
        throw new ConflictException(`Coupon code ${code} already exists`);
    }

    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: this.toData(dto, code),
    });

    return this.map(coupon);
  }

  // Deletes a promo code.
  async remove(id: string): Promise<{ message: string }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');

    if (coupon._count.orders > 0) {
      const deactivated = await this.prisma.coupon.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        message: `This code has been used on ${coupon._count.orders} order(s), so it was deactivated rather than deleted (code: ${deactivated.code})`,
      };
    }

    await this.prisma.coupon.delete({ where: { id } });
    return { message: 'Coupon deleted' };
  }

  // Normalises DTO fields into the shape Prisma expects.
  private toData(dto: UpdateCouponDto, code?: string) {
    return {
      ...(code ? { code } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.value !== undefined ? { value: dto.value } : {}),
      ...(dto.minOrderAmount !== undefined
        ? { minOrderAmount: dto.minOrderAmount }
        : {}),
      ...(dto.maxDiscount !== undefined
        ? { maxDiscount: dto.maxDiscount }
        : {}),
      ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
      // An explicit null means "no window at all". new Date(null) is the epoch,
      // which used to write an expiry in 1970 and kill the code on the spot.
      ...(dto.startsAt !== undefined
        ? { startsAt: dto.startsAt === null ? null : new Date(dto.startsAt) }
        : {}),
      ...(dto.expiresAt !== undefined
        ? { expiresAt: dto.expiresAt === null ? null : new Date(dto.expiresAt) }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
  }

  // Shapes a coupon row into its API response.
  private map(coupon: Coupon): CouponResponseDto {
    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      minOrderAmount: coupon.minOrderAmount
        ? Number(coupon.minOrderAmount)
        : null,
      maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }
}
