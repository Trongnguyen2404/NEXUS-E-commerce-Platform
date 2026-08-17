import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { GetUser } from '@/common/decorators/get-user.decorator';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import { CreateReviewDto } from '@/modules/reviews/dto/create-review.dto';
import { QueryReviewsDto } from '@/modules/reviews/dto/query-reviews.dto';
import {
  PaginatedReviewsDto,
  ReviewResponseDto,
} from '@/modules/reviews/dto/review-response.dto';
import {
  ModerateThrottle,
  RelaxedThrottle,
} from '@/common/decorators/custom-throttler.decorator';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Public: anyone browsing a product page sees its reviews.
  @Get('products/:productId/reviews')
  @RelaxedThrottle()
  @ApiOperation({
    summary: 'List reviews for a product',
    description:
      'Includes an overall summary: average, total and star distribution.',
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiOkResponse({ type: PaginatedReviewsDto })
  async findByProduct(
    @Param('productId') productId: string,
    @Query() query: QueryReviewsDto,
  ) {
    return await this.reviewsService.findByProduct(productId, query);
  }

  @Post('products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ModerateThrottle()
  @ApiOperation({
    summary: 'Write or update your review for a product',
    description:
      'One review per person per product — posting again replaces the previous one. Reviews from customers who bought the product are flagged as verified purchases.',
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async upsert(
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    @GetUser('id') userId: string,
  ) {
    return await this.reviewsService.upsert(userId, productId, dto);
  }

  @Get('products/:productId/reviews/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @RelaxedThrottle()
  @ApiOperation({
    summary: 'Your own review for a product',
    description: 'Returns null when you have not reviewed it yet.',
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiOkResponse({ type: ReviewResponseDto })
  async findMine(
    @Param('productId') productId: string,
    @GetUser('id') userId: string,
  ) {
    return await this.reviewsService.findMine(userId, productId);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ModerateThrottle()
  @ApiOperation({
    summary: 'Delete a review',
    description: 'Authors can delete their own; admins can delete any.',
  })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiOkResponse({ description: 'Review deleted' })
  @ApiForbiddenResponse({ description: 'Not your review' })
  @ApiNotFoundResponse({ description: 'Review not found' })
  async remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: Role,
  ) {
    return await this.reviewsService.remove(id, userId, role);
  }
}
