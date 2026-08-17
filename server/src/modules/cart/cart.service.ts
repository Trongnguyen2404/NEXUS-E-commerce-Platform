import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CartResponseDto } from '@/modules/cart/dto/cart-response.dto';
import { AddToCartDto } from '@/modules/cart/dto/add-to-cart.dto';
import { UpdateCartItemDto } from '@/modules/cart/dto/update-cart-item.dto';
import { CartItemResponseDto } from '@/modules/cart/dto/cart-item-response.dto';
import { ProductVariant } from '@prisma/client';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get or create active cart
   */
  async getOrCreateCart(userId: string): Promise<CartResponseDto> {
    return this.getOrCreateActiveCart(userId);
  }

  /**
   * Add item to cart
   */
  async addToCart(
    userId: string,
    addToCartDto: AddToCartDto,
  ): Promise<CartResponseDto> {
    const { productId, quantity, variantId } = addToCartDto;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (!product.isActive)
      throw new BadRequestException('Product is not available');

    // Stock lives on the variant for products that have them.
    let variant: ProductVariant | null = null;

    if (product.hasVariants) {
      if (!variantId) {
        throw new BadRequestException(
          `Choose an option for ${product.name} first`,
        );
      }
      variant = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId },
      });
      if (!variant) throw new NotFoundException('That option is not available');
      if (!variant.isActive)
        throw new BadRequestException(
          `${product.name} (${variant.label}) is not available`,
        );
    } else if (variantId) {
      throw new BadRequestException(
        `${product.name} does not have options to choose from`,
      );
    }

    const availableStock = variant ? variant.stock : product.stock;
    if (availableStock < quantity)
      throw new BadRequestException(
        `Insufficient stock. Available: ${availableStock}`,
      );

    const cart = await this.getOrCreateActiveCart(userId);

    // "" rather than null: the unique index needs a non-null value, since
    // Postgres would treat two NULLs as different rows.
    const variantKey = variant?.id ?? '';

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_variantKey: {
          cartId: cart.id,
          productId,
          variantKey,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (availableStock < newQuantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${availableStock}, Current in cart: ${existingItem.quantity}`,
        );
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          variantId: variant?.id ?? null,
          variantKey,
          quantity,
        },
      });
    }

    return this.getOrCreateActiveCart(userId);
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(
    userId: string,
    cartItemId: string,
    updateCartItemDto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const { quantity } = updateCartItemDto;

    const cartItem = await this.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: {
        cart: true,
        product: true,
        variant: true,
      },
    });

    if (!cartItem || cartItem.cart.userId !== userId)
      throw new NotFoundException('Cart item not found');

    // Check against whichever row actually holds the stock for this line.
    const availableStock = cartItem.variant
      ? cartItem.variant.stock
      : cartItem.product.stock;

    if (availableStock < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${availableStock}`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });

    return this.getOrCreateActiveCart(userId);
  }

  /**
   * Remove item
   */
  async removeFromCart(
    userId: string,
    cartItemId: string,
  ): Promise<CartResponseDto> {
    const cartItem = await this.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== userId)
      throw new NotFoundException('Cart item not found');

    await this.prisma.cartItem.delete({
      where: { id: cartItemId },
    });

    return this.getOrCreateActiveCart(userId);
  }

  /**
   * Clear cart
   */
  async clearCart(userId: string): Promise<CartResponseDto> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId, checkedOut: false },
    });

    if (cart) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return this.getOrCreateActiveCart(userId);
  }

  /**
   * Merge guest cart into active cart
   */
  async mergeCart(
    userId: string,
    items: { productId: string; quantity: number }[],
  ): Promise<CartResponseDto> {
    if (!items || items.length === 0) {
      return this.getOrCreateActiveCart(userId);
    }

    for (const item of items) {
      try {
        await this.addToCart(userId, {
          productId: item.productId,
          quantity: item.quantity,
        });
      } catch (err) {
        console.warn(
          `[CartService] Failed to merge item ${item.productId}:`,
          err.message,
        );
      }
    }

    return this.getOrCreateActiveCart(userId);
  }

  /**
   * Format cart
   */
  private formatCart(cart: any): CartResponseDto {
    const cartItems: CartItemResponseDto[] = cart.cartItems.map((item: any) => {
      // A variant may override the price; one without its own price
      // inherits the product's. Getting this wrong would show a cart
      // total that does not match what checkout charges.
      const unitPrice = Number(item.variant?.price ?? item.product.price);

      return {
        id: item.id,
        cartId: item.cartId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantLabel: item.variant?.label ?? null,
        quantity: item.quantity,
        unitPrice,
        availableStock: item.variant ? item.variant.stock : item.product.stock,
        product: {
          ...item.product,
          price: Number(item.product.price),
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    const totalPrice = cartItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: cart.id,
      userId: cart.userId,
      cartItems,
      totalPrice,
      totalItems,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  /**
   * Get or create active (non-checked-out) cart
   */
  async getOrCreateActiveCart(userId: string) {
    let cart = await this.prisma.cart.findFirst({
      where: { userId, checkedOut: false },
      include: {
        cartItems: { include: { product: true, variant: true } },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: {
          cartItems: { include: { product: true, variant: true } },
        },
      });
    }

    return this.formatCart(cart);
  }
}
