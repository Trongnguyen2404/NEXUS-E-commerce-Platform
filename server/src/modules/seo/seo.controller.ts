import { Controller, Get, Header, Logger, OnModuleInit } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';

const DEV_SITE_URL = 'http://localhost:5173';

// Escapes the five characters that are not legal as-is in XML text.
const xml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Serves a sitemap built from what is actually in the catalogue right now.
@ApiExcludeController()
@Controller()
export class SeoController implements OnModuleInit {
  private readonly logger = new Logger(SeoController.name);

  constructor(private readonly prisma: PrismaService) {}

  // Says so at boot when the sitemap would advertise localhost.
  //
  // Forgetting PUBLIC_SITE_URL fails silently in the worst way: the deploy is
  // green, /sitemap.xml answers 200, and every URL inside it points at a
  // machine only the developer can reach. Nothing surfaces that until someone
  // wonders why the store never appears in search.
  onModuleInit(): void {
    if (process.env.PUBLIC_SITE_URL) return;

    const message =
      `PUBLIC_SITE_URL is not set, so the sitemap and robots.txt will point at ` +
      `${DEV_SITE_URL}. Set it to the public storefront origin.`;

    if (process.env.NODE_ENV === 'production') this.logger.error(message);
    else this.logger.warn(message);
  }

  private get site(): string {
    return (process.env.PUBLIC_SITE_URL ?? DEV_SITE_URL).replace(/\/$/, '');
  }

  // Lists the storefront routes plus every live product and category.
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemap(): Promise<string> {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true, name: true, updatedAt: true },
      }),
    ]);

    const day = (d: Date) => d.toISOString().slice(0, 10);
    const entry = (path: string, lastmod: string, priority: string) =>
      `  <url><loc>${xml(this.site + path)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;

    const today = day(new Date());

    const rows = [
      entry('/', today, '1.0'),
      entry('/products', today, '0.9'),
      entry('/categories', today, '0.8'),
      entry('/contact', today, '0.4'),
      ...categories.map((c) =>
        entry(
          `/products?category=${encodeURIComponent(c.slug ?? c.name)}`,
          day(c.updatedAt),
          '0.7',
        ),
      ),
      ...products.map((p) =>
        entry(`/products/${p.id}`, day(p.updatedAt), '0.6'),
      ),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>`;
  }

  // Points crawlers at the sitemap above; the SPA ships its own static copy too.
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots(): string {
    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /account',
      'Disallow: /cart',
      'Disallow: /checkout',
      '',
      `Sitemap: ${this.site}/api/v1/sitemap.xml`,
      '',
    ].join('\n');
  }
}
