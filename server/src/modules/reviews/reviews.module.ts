import { Module } from '@nestjs/common';
import { ReviewsController } from '@/modules/reviews/reviews.controller';
import { ReviewsService } from '@/modules/reviews/reviews.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  // Exported so ProductsService can attach ratings to product listings.
  exports: [ReviewsService],
})
export class ReviewsModule {}
