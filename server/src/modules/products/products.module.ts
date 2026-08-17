import { Module } from '@nestjs/common';
import { ProductsController } from '@/modules/products/products.controller';
import { ProductsService } from '@/modules/products/products.service';
import { VariantsController } from '@/modules/products/variants.controller';
import { VariantsService } from '@/modules/products/variants.service';
import { ReviewsModule } from '@/modules/reviews/reviews.module';

@Module({
  // ReviewsModule supplies the aggregate ratings attached to each product.
  imports: [ReviewsModule],
  controllers: [ProductsController, VariantsController],
  providers: [ProductsService, VariantsService]
})
export class ProductsModule { }
