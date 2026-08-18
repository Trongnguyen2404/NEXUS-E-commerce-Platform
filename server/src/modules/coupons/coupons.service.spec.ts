import { ConflictException, NotFoundException } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { aCoupon, money } from '@/common/testing/factories';
import { UpdateCouponDto } from '@/modules/coupons/dto/coupon.dto';

describe('CouponsService', () => {
  let prisma: PrismaMock;
  let coupons: CouponsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    coupons = new CouponsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  // A row as Prisma hands it back when the query counts the orders using it.
  const withOrders = (orders: number, over: Record<string, unknown> = {}) => ({
    ...aCoupon(over),
    _count: { orders },
  });

  // The response is built from the written row, so echo it back the way the
  // database would: money columns arrive as Decimal, not as plain numbers.
  const echoOnCreate = () => {
    prisma.coupon.create.mockImplementation(((args: {
      data: Record<string, unknown>;
    }) => {
      const data = args.data;
      const decimal = (value: unknown) =>
        value === null || value === undefined ? null : money(value as number);
      return Promise.resolve(
        aCoupon({
          ...data,
          value: money(data.value as number),
          minOrderAmount: decimal(data.minOrderAmount),
          maxDiscount: decimal(data.maxDiscount),
        }),
      );
    }) as never);
  };

  const aValidCreate = () => ({
    code: 'WELCOME10',
    type: DiscountType.PERCENT,
    value: 10,
  });

  describe('findAll', () => {
    it('lists the newest promo code first', async () => {
      prisma.coupon.findMany.mockResolvedValue([] as never);

      await coupons.findAll();

      expect(prisma.coupon.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns an empty list when no promo code exists', async () => {
      prisma.coupon.findMany.mockResolvedValue([] as never);

      await expect(coupons.findAll()).resolves.toEqual([]);
    });

    it('returns every promo code in the order the database gave them', async () => {
      prisma.coupon.findMany.mockResolvedValue([
        aCoupon({ id: 'coupon-2', code: 'NEWER' }),
        aCoupon({ id: 'coupon-1', code: 'OLDER' }),
      ] as never);

      const listed = await coupons.findAll();

      expect(listed.map((coupon) => coupon.code)).toEqual(['NEWER', 'OLDER']);
    });

    it('converts the Decimal money columns into plain numbers', async () => {
      prisma.coupon.findMany.mockResolvedValue([
        aCoupon({
          value: money(12.5),
          minOrderAmount: money(50),
          maxDiscount: money(7.25),
        }),
      ] as never);

      const [listed] = await coupons.findAll();

      expect(listed.value).toBe(12.5);
      expect(listed.minOrderAmount).toBe(50);
      expect(listed.maxDiscount).toBe(7.25);
    });

    it('reports an unset minimum spend, ceiling and usage cap as null', async () => {
      prisma.coupon.findMany.mockResolvedValue([
        aCoupon({ minOrderAmount: null, maxDiscount: null, maxUses: null }),
      ] as never);

      const [listed] = await coupons.findAll();

      expect(listed.minOrderAmount).toBeNull();
      expect(listed.maxDiscount).toBeNull();
      expect(listed.maxUses).toBeNull();
    });

    it('keeps a zero minimum spend as zero instead of reporting no minimum', async () => {
      prisma.coupon.findMany.mockResolvedValue([
        aCoupon({ minOrderAmount: money(0) }),
      ] as never);

      const [listed] = await coupons.findAll();

      expect(listed.minOrderAmount).toBe(0);
    });

    it('passes the redemption counters and the validity window through untouched', async () => {
      const startsAt = new Date('2026-09-01T00:00:00.000Z');
      const expiresAt = new Date('2026-12-31T23:59:59.000Z');
      prisma.coupon.findMany.mockResolvedValue([
        aCoupon({ maxUses: 100, usedCount: 37, startsAt, expiresAt }),
      ] as never);

      const [listed] = await coupons.findAll();

      expect(listed).toMatchObject({
        maxUses: 100,
        usedCount: 37,
        startsAt,
        expiresAt,
      });
    });

    it('exposes exactly the fields of the API response', async () => {
      prisma.coupon.findMany.mockResolvedValue([aCoupon()] as never);

      const [listed] = await coupons.findAll();

      expect(Object.keys(listed).sort()).toEqual(
        [
          'code',
          'createdAt',
          'expiresAt',
          'id',
          'isActive',
          'maxDiscount',
          'maxUses',
          'minOrderAmount',
          'startsAt',
          'type',
          'updatedAt',
          'usedCount',
          'value',
        ].sort(),
      );
    });
  });

  describe('create', () => {
    it('upper-cases the submitted code', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create({
        ...aValidCreate(),
        code: 'welcome10',
      });

      expect(created.code).toBe('WELCOME10');
    });

    it('trims whitespace off the submitted code', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create({
        ...aValidCreate(),
        code: '  welcome10  ',
      });

      expect(created.code).toBe('WELCOME10');
    });

    it('checks for a clash using the normalised code', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      await coupons.create({ ...aValidCreate(), code: ' welcome10 ' });

      expect(prisma.coupon.findUnique).toHaveBeenCalledWith({
        where: { code: 'WELCOME10' },
      });
    });

    it('rejects a code that already exists', async () => {
      prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);

      await expect(
        coupons.create({ ...aValidCreate(), code: 'save10' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        coupons.create({ ...aValidCreate(), code: 'save10' }),
      ).rejects.toThrow('Coupon code SAVE10 already exists');
      expect(prisma.coupon.create).not.toHaveBeenCalled();
    });

    it('records the discount type and value as submitted', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create({
        code: 'TENOFF',
        type: DiscountType.FIXED,
        value: 10,
      });

      expect(created.type).toBe(DiscountType.FIXED);
      expect(created.value).toBe(10);
    });

    it('leaves the optional limits unset when they are omitted', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create(aValidCreate());

      expect(created).toMatchObject({
        minOrderAmount: null,
        maxDiscount: null,
        maxUses: null,
        startsAt: null,
        expiresAt: null,
      });
    });

    it('keeps the optional limits that were supplied', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create({
        ...aValidCreate(),
        minOrderAmount: 50,
        maxDiscount: 25,
        maxUses: 200,
      });

      expect(created).toMatchObject({
        minOrderAmount: 50,
        maxDiscount: 25,
        maxUses: 200,
      });
    });

    it('makes a new code active by default', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create(aValidCreate());

      expect(created.isActive).toBe(true);
    });

    it('creates a code switched off when isActive is explicitly false', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create({
        ...aValidCreate(),
        isActive: false,
      });

      expect(created.isActive).toBe(false);
    });

    it('turns the ISO validity window into dates', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);
      echoOnCreate();

      const created = await coupons.create({
        ...aValidCreate(),
        startsAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-12-31T23:59:59.000Z',
      });

      expect(created.startsAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
      expect(created.expiresAt).toEqual(new Date('2026-12-31T23:59:59.000Z'));
    });
  });

  describe('update', () => {
    it('refuses an id that does not exist', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);

      await expect(
        coupons.update('ghost', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        coupons.update('ghost', { isActive: false }),
      ).rejects.toThrow('Coupon not found');
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('rejects a new code that another coupon already owns', async () => {
      prisma.coupon.findUnique
        .mockResolvedValueOnce(aCoupon({ code: 'SAVE10' }) as never)
        .mockResolvedValueOnce(
          aCoupon({ id: 'coupon-2', code: 'NEWYEAR' }) as never,
        );

      await expect(
        coupons.update('coupon-1', { code: 'newyear' }),
      ).rejects.toThrow('Coupon code NEWYEAR already exists');
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('upper-cases a changed code before writing it', async () => {
      prisma.coupon.findUnique
        .mockResolvedValueOnce(aCoupon({ code: 'SAVE10' }) as never)
        .mockResolvedValueOnce(null as never);
      prisma.coupon.update.mockResolvedValue(
        aCoupon({ code: 'NEWYEAR' }) as never,
      );

      const updated = await coupons.update('coupon-1', { code: ' newyear ' });

      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { code: 'NEWYEAR' },
      });
      expect(updated.code).toBe('NEWYEAR');
    });

    it('lets a coupon resubmit its own code in any case without a clash check', async () => {
      prisma.coupon.findUnique.mockResolvedValueOnce(
        aCoupon({ code: 'SAVE10' }) as never,
      );
      prisma.coupon.update.mockResolvedValue(aCoupon() as never);

      await coupons.update('coupon-1', { code: 'save10' });

      // Only the id lookup ran; no second query went looking for a duplicate.
      expect(prisma.coupon.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { code: 'SAVE10' },
      });
    });

    it('writes only the fields the caller supplied', async () => {
      prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);
      prisma.coupon.update.mockResolvedValue(
        aCoupon({ isActive: false }) as never,
      );

      await coupons.update('coupon-1', { isActive: false });

      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { isActive: false },
      });
    });

    it('writes every editable field when the whole coupon is resubmitted', async () => {
      prisma.coupon.findUnique.mockResolvedValue(
        aCoupon({ code: 'SAVE10' }) as never,
      );
      prisma.coupon.update.mockResolvedValue(aCoupon() as never);

      await coupons.update('coupon-1', {
        type: DiscountType.FIXED,
        value: 15,
        minOrderAmount: 60,
        maxDiscount: 20,
        maxUses: 5,
        startsAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-12-31T23:59:59.000Z',
        isActive: true,
      });

      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: {
          type: DiscountType.FIXED,
          value: 15,
          minOrderAmount: 60,
          maxDiscount: 20,
          maxUses: 5,
          startsAt: new Date('2026-09-01T00:00:00.000Z'),
          expiresAt: new Date('2026-12-31T23:59:59.000Z'),
          isActive: true,
        },
      });
    });

    it.each(['startsAt', 'expiresAt'] as const)(
      'clears %s when the admin sends null instead of stamping it 1970',
      async (field) => {
        prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);
        prisma.coupon.update.mockResolvedValue(aCoupon() as never);

        await coupons.update('coupon-1', { [field]: null });

        const { data } = (prisma.coupon.update as unknown as jest.Mock).mock
          .calls[0][0] as { data: Record<string, unknown> };
        expect(data[field]).toBeNull();
        expect(data[field]).not.toEqual(new Date(0));
      },
    );

    it('leaves a date alone when the body omits it entirely', async () => {
      prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);
      prisma.coupon.update.mockResolvedValue(aCoupon() as never);

      await coupons.update('coupon-1', { isActive: false });

      const { data } = (prisma.coupon.update as unknown as jest.Mock).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('startsAt');
      expect(data).not.toHaveProperty('expiresAt');
    });

    it('sends an empty change set when the body carries no fields', async () => {
      prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);
      prisma.coupon.update.mockResolvedValue(aCoupon() as never);

      await coupons.update('coupon-1', {});

      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: {},
      });
    });

    it('clears the minimum spend when null is sent for it', async () => {
      prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);
      prisma.coupon.update.mockResolvedValue(
        aCoupon({ minOrderAmount: null }) as never,
      );

      const updated = await coupons.update('coupon-1', {
        minOrderAmount: null,
      } as unknown as UpdateCouponDto);

      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { minOrderAmount: null },
      });
      expect(updated.minOrderAmount).toBeNull();
    });

    it('returns the saved coupon in API shape', async () => {
      prisma.coupon.findUnique.mockResolvedValue(aCoupon() as never);
      prisma.coupon.update.mockResolvedValue(
        aCoupon({
          type: DiscountType.FIXED,
          value: money(15),
          minOrderAmount: money(60),
          usedCount: 3,
        }) as never,
      );

      const updated = await coupons.update('coupon-1', { value: 15 });

      expect(updated).toMatchObject({
        id: 'coupon-1',
        code: 'SAVE10',
        type: DiscountType.FIXED,
        value: 15,
        minOrderAmount: 60,
        usedCount: 3,
      });
    });
  });

  describe('remove', () => {
    it('deletes a code no order has used', async () => {
      prisma.coupon.findUnique.mockResolvedValue(withOrders(0) as never);

      const result = await coupons.remove('coupon-1');

      expect(result).toEqual({ message: 'Coupon deleted' });
      expect(prisma.coupon.delete).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
      });
    });

    it('deactivates rather than deletes a code that orders point at', async () => {
      prisma.coupon.findUnique.mockResolvedValue(withOrders(2) as never);
      prisma.coupon.update.mockResolvedValue(
        aCoupon({ isActive: false }) as never,
      );

      const result = await coupons.remove('coupon-1');

      expect(prisma.coupon.delete).not.toHaveBeenCalled();
      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { isActive: false },
      });
      expect(result.message).toContain('used on 2 order(s)');
      expect(result.message).toContain('SAVE10');
    });

    it('keeps a code alive for a single referencing order', async () => {
      prisma.coupon.findUnique.mockResolvedValue(withOrders(1) as never);
      prisma.coupon.update.mockResolvedValue(
        aCoupon({ isActive: false }) as never,
      );

      await coupons.remove('coupon-1');

      expect(prisma.coupon.delete).not.toHaveBeenCalled();
    });

    it('refuses an id that does not exist', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null as never);

      await expect(coupons.remove('ghost')).rejects.toThrow(NotFoundException);
      await expect(coupons.remove('ghost')).rejects.toThrow('Coupon not found');
      expect(prisma.coupon.delete).not.toHaveBeenCalled();
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });
  });
});
