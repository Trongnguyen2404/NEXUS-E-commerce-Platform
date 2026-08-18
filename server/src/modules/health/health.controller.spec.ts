import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '@/modules/health/health.controller';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';

describe('HealthController', () => {
  let prisma: PrismaMock;
  let controller: HealthController;

  beforeEach(() => {
    prisma = createPrismaMock();
    controller = new HealthController(prisma as unknown as PrismaService);
  });

  afterEach(() => resetPrismaMock(prisma));

  describe('live', () => {
    // The whole reason this route exists. A pinger calling it every ten
    // minutes must not keep a free-tier database awake.
    it('answers without querying the database', () => {
      const body = controller.live();

      expect(body.status).toBe('ok');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('reports how long the process has been up', () => {
      expect(controller.live().uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(controller.live().uptimeSeconds)).toBe(true);
    });

    it('is not async, so it cannot be blocked by a slow database', () => {
      expect(controller.live()).not.toBeInstanceOf(Promise);
    });
  });

  describe('check', () => {
    it('reports the database as up when the probe query succeeds', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }] as never);

      const body = await controller.check();

      expect(body.status).toBe('ok');
      expect(body.database.status).toBe('up');
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('turns an unreachable database into a 503 rather than a 500', async () => {
      prisma.$queryRaw.mockRejectedValue(
        new Error('connection refused') as never,
      );

      await expect(controller.check()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('reports how long the probe query took', async () => {
      prisma.$queryRaw.mockResolvedValue([] as never);

      const body = await controller.check();

      expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ready', () => {
    it('runs the same database probe as the health check', async () => {
      prisma.$queryRaw.mockResolvedValue([] as never);

      await controller.ready();

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
