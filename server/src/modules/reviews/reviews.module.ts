import { Module } from '@nestjs/common';
import { ReviewsController } from '@/modules/reviews/reviews.controller';
import { ReviewsService } from '@/modules/reviews/reviews.service';

// Product review feature module.
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],

  exports: [ReviewsService],
})
export class ReviewsModule {}
