import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { GetUser } from '@/common/decorators/get-user.decorator';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import {
  ModerateThrottle,
  RelaxedThrottle,
} from '@/common/decorators/custom-throttler.decorator';

// Endpoints for the signed-in user's saved products.
@ApiTags('wishlist')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  // Lists the caller's saved products.
  @Get()
  @RelaxedThrottle()
  @ApiOperation({ summary: 'Products you have saved' })
  @ApiOkResponse({ description: 'Saved products, newest first' })
  async findAll(@GetUser('id') userId: string) {
    return await this.wishlistService.findAll(userId);
  }

  // Saves a product to the wishlist.
  @Post(':productId')
  @ModerateThrottle()
  @ApiOperation({
    summary: 'Save a product',
    description: 'Idempotent — saving something already saved changes nothing.',
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async add(
    @Param('productId') productId: string,
    @GetUser('id') userId: string,
  ) {
    return await this.wishlistService.add(userId, productId);
  }

  // Adds or removes a product depending on whether it is already saved.
  @Post(':productId/toggle')
  @ModerateThrottle()
  @ApiOperation({
    summary: 'Toggle a product in your wishlist',
    description: 'Returns the resulting state, for a heart button.',
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async toggle(
    @Param('productId') productId: string,
    @GetUser('id') userId: string,
  ) {
    return await this.wishlistService.toggle(userId, productId);
  }

  // Removes a product from the wishlist.
  @Delete(':productId')
  @ModerateThrottle()
  @ApiOperation({ summary: 'Remove a product from your wishlist' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async remove(
    @Param('productId') productId: string,
    @GetUser('id') userId: string,
  ) {
    return await this.wishlistService.remove(userId, productId);
  }
}
