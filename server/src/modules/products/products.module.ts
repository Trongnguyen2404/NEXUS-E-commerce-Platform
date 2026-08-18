import { Module } from '@nestjs/common';
import { ProductsController } from '@/modules/products/products.controller';
import { ProductsService } from '@/modules/products/products.service';
import { VariantsController } from '@/modules/products/variants.controller';
import { VariantsService } from '@/modules/products/variants.service';
import { ReviewsModule } from '@/modules/reviews/reviews.module';

// Product and variant feature module.
@Module({
  imports: [ReviewsModule],
  controllers: [ProductsController, VariantsController],
  providers: [ProductsService, VariantsService],
})
export class ProductsModule {}
