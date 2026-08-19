import { Logger } from '@nestjs/common';
import { SeoController } from '@/modules/seo/seo.controller';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';

describe('SeoController', () => {
  let prisma: PrismaMock;
  let controller: SeoController;

  const ENV = { ...process.env };

  const givenCatalogue = () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'prod-1', updatedAt: new Date('2026-08-01T00:00:00.000Z') },
    ] as never);
    prisma.category.findMany.mockResolvedValue([
      {
        slug: 'audio',
        name: 'Audio',
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ] as never);
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    controller = new SeoController(prisma as unknown as PrismaService);
    givenCatalogue();
  });

  afterEach(() => {
    resetPrismaMock(prisma);
    process.env = { ...ENV };
    jest.restoreAllMocks();
  });

  describe('the PUBLIC_SITE_URL guard', () => {
    // The failure this exists to stop: a green deploy whose sitemap advertises
    // a machine only the developer can reach.
    it('logs an error in production when the public origin is missing', () => {
      delete process.env.PUBLIC_SITE_URL;
      process.env.NODE_ENV = 'production';
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      controller.onModuleInit();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('PUBLIC_SITE_URL'),
      );
    });

    it('only warns outside production, where localhost is the right answer', () => {
      delete process.env.PUBLIC_SITE_URL;
      process.env.NODE_ENV = 'development';
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      controller.onModuleInit();

      expect(warn).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('says nothing once the origin is configured', () => {
      process.env.PUBLIC_SITE_URL = 'https://shop.example.com';
      process.env.NODE_ENV = 'production';
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      controller.onModuleInit();

      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('sitemap.xml', () => {
    it('builds absolute URLs from the configured origin', async () => {
      process.env.PUBLIC_SITE_URL = 'https://shop.example.com';

      const xml = await controller.sitemap();

      expect(xml).toContain('<loc>https://shop.example.com/</loc>');
      expect(xml).toContain(
        '<loc>https://shop.example.com/products/prod-1</loc>',
      );
      expect(xml).not.toContain('localhost');
    });

    it('tolerates a trailing slash on the configured origin', async () => {
      process.env.PUBLIC_SITE_URL = 'https://shop.example.com/';

      const xml = await controller.sitemap();

      expect(xml).toContain('<loc>https://shop.example.com/</loc>');
      expect(xml).not.toContain('.com//');
    });

    it('lists only products the storefront actually shows', async () => {
      await controller.sitemap();

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('percent-encodes a category name with characters that are unsafe in a URL', async () => {
      process.env.PUBLIC_SITE_URL = 'https://shop.example.com';
      prisma.category.findMany.mockResolvedValue([
        { slug: null, name: 'Toys & Games', updatedAt: new Date('2026-08-02') },
      ] as never);

      const xml = await controller.sitemap();

      // encodeURIComponent runs before the XML escaper, so the ampersand never
      // reaches the document as a raw character in the first place.
      expect(xml).toContain('category=Toys%20%26%20Games');
      expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
    });

    it('escapes an ampersand that reaches the document unencoded', async () => {
      // The origin is interpolated straight in, so it is the one input the XML
      // escaper actually has to defend.
      process.env.PUBLIC_SITE_URL = 'https://shop.example.com/?a=1&b=2';

      const xml = await controller.sitemap();

      expect(xml).toContain('&amp;b=2');
      expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
    });
  });

  describe('robots.txt', () => {
    it('points crawlers at the sitemap on the configured origin', () => {
      process.env.PUBLIC_SITE_URL = 'https://shop.example.com';

      const body = controller.robots();

      expect(body).toContain(
        'Sitemap: https://shop.example.com/api/v1/sitemap.xml',
      );
    });

    it('keeps the private areas out of the index', () => {
      const body = controller.robots();

      for (const path of ['/admin', '/account', '/cart', '/checkout']) {
        expect(body).toContain(`Disallow: ${path}`);
      }
    });
  });
});
