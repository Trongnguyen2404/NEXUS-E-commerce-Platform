import { Module } from '@nestjs/common';
import { WishlistController } from '@/modules/wishlist/wishlist.controller';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import { ReviewsModule } from '@/modules/reviews/reviews.module';

// Wishlist feature module.
@Module({
  imports: [ReviewsModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
