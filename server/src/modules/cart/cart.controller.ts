import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CartService } from '@/modules/cart/cart.service';
import { CartResponseDto } from '@/modules/cart/dto/cart-response.dto';
import { GetUser } from '@/common/decorators/get-user.decorator';
import { AddToCartDto } from '@/modules/cart/dto/add-to-cart.dto';
import { UpdateCartItemDto } from '@/modules/cart/dto/update-cart-item.dto';
import { MergeCartDto } from '@/modules/cart/dto/merge-cart.dto';

// Endpoints for the signed-in user's shopping cart.
@ApiTags('cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // Returns the caller's cart, creating an empty one if needed.
  @Get()
  @ApiOperation({ summary: 'Get current user cart' })
  @ApiResponse({
    status: 200,
    description: 'User cart with items',
    type: CartResponseDto,
  })
  async getCart(@GetUser('id') userId: string): Promise<CartResponseDto> {
    return this.cartService.getOrCreateCart(userId);
  }

  // Adds a product, or a specific variant, to the cart.
  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiBody({ type: AddToCartDto })
  @ApiResponse({
    status: 201,
    description: 'Item added to cart',
    type: CartResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({
    status: 400,
    description: 'Product unavailable or insufficient stock',
  })
  async addToCart(
    @GetUser('id') userId: string,
    @Body() addToCartDto: AddToCartDto,
  ): Promise<CartResponseDto> {
    return this.cartService.addToCart(userId, addToCartDto);
  }

  // Changes the quantity of one cart line, and the option it points at.
  @Patch('items/:id')
  @ApiOperation({
    summary: 'Update cart item quantity, or the option it points at',
  })
  @ApiBody({ type: UpdateCartItemDto })
  @ApiResponse({
    status: 200,
    description: 'Cart item updated',
    type: CartResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Cart item or option not found' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  async updateCartItem(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartService.updateCartItem(userId, id, updateCartItemDto);
  }

  // Removes one line from the cart.
  @Delete('items/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({
    status: 200,
    description: 'Item removed from cart',
    type: CartResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async removeFromCart(
    @GetUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<CartResponseDto> {
    return this.cartService.removeFromCart(userId, id);
  }

  // Empties the cart.
  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiResponse({
    status: 200,
    description: 'Cart cleared',
    type: CartResponseDto,
  })
  async clearCart(@GetUser('id') userId: string): Promise<CartResponseDto> {
    return this.cartService.clearCart(userId);
  }

  // Folds a guest cart into the signed-in user's cart.
  @Post('merge')
  @ApiOperation({ summary: 'Merge guest cart into user cart' })
  @ApiBody({ type: MergeCartDto })
  @ApiResponse({
    status: 200,
    description: 'Merged cart',
    type: CartResponseDto,
  })
  async mergeCart(
    @GetUser('id') userId: string,
    @Body() mergeCartDto: MergeCartDto,
  ): Promise<CartResponseDto> {
    return this.cartService.mergeCart(userId, mergeCartDto.items);
  }
}
