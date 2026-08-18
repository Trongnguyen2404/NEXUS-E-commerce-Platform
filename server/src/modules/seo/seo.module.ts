import { Module } from '@nestjs/common';
import { SeoController } from '@/modules/seo/seo.controller';

// Crawler-facing endpoints: sitemap and robots.
@Module({ controllers: [SeoController] })
export class SeoModule {}
