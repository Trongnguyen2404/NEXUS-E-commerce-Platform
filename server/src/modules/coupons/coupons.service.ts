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

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<CouponResponseDto[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return coupons.map((coupon) => this.map(coupon));
  }

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

  async remove(id: string): Promise<{ message: string }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');

    // Orders reference the coupon to explain their own discount. Deleting one
    // that has been used would orphan that explanation, so deactivate instead.
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

  /**
   * Update payload only. Every key is conditional so an omitted field is left
   * untouched rather than nulled — PATCH semantics, not PUT.
   */
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
      ...(dto.startsAt !== undefined
        ? { startsAt: new Date(dto.startsAt) }
        : {}),
      ...(dto.expiresAt !== undefined
        ? { expiresAt: new Date(dto.expiresAt) }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
  }

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
