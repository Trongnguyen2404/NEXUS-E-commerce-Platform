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

// Cart reads and writes, including stock checks and guest-cart merging.
@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  // Returns the user's active cart, creating one on first use.
  async getOrCreateCart(userId: string): Promise<CartResponseDto> {
    return this.getOrCreateActiveCart(userId);
  }

  // Adds a line, or bumps quantity if that product and variant is already there.
  async addToCart(
    userId: string,
    addToCartDto: AddToCartDto,
  ): Promise<CartResponseDto> {
    const { productId, quantity, variantId } = addToCartDto;

    // mergeCart forwards guest lines straight in here, so the floor cannot live
    // on the DTO alone: a zero or negative quantity sails past the stock check
    // below and would be written to the line as-is.
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (!product.isActive)
      throw new BadRequestException('Product is not available');

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

    const variantKey = variant?.id ?? '';

    // One atomic statement instead of read-then-write: two concurrent adds now
    // both increment the same row rather than both writing the total they read
    // (one add silently lost) or both creating and tripping the unique key.
    const line = await this.prisma.cartItem.upsert({
      where: {
        cartId_productId_variantKey: {
          cartId: cart.id,
          productId,
          variantKey,
        },
      },
      create: {
        cartId: cart.id,
        productId,
        variantId: variant?.id ?? null,
        variantKey,
        quantity,
      },
      update: { quantity: { increment: quantity } },
    });

    if (line.quantity > availableStock) {
      // The ceiling can only be judged once the increment has landed, so undo
      // it with the mirror-image decrement — an absolute write back would
      // clobber whatever a concurrent add did in between.
      const previous = line.quantity - quantity;

      await this.prisma.cartItem.update({
        where: { id: line.id },
        data: { quantity: { decrement: quantity } },
      });

      throw new BadRequestException(
        `Insufficient stock. Available: ${availableStock}, Current in cart: ${previous}`,
      );
    }

    return this.getOrCreateActiveCart(userId);
  }

  // Sets a line's quantity, and optionally the option it points at, after checking stock.
  async updateCartItem(
    userId: string,
    cartItemId: string,
    updateCartItemDto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const { quantity, variantId } = updateCartItemDto;

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

    // A line added before the product gained options blocks the entire basket
    // at checkout, so the shopper needs a way to point it at a real variant.
    const repointing =
      variantId !== undefined && variantId !== cartItem.variantId;
    let variant = cartItem.variant;

    if (repointing) {
      if (!cartItem.product.hasVariants)
        throw new BadRequestException(
          `${cartItem.product.name} does not have options to choose from`,
        );

      variant = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId: cartItem.productId },
      });

      if (!variant) throw new NotFoundException('That option is not available');
      if (!variant.isActive)
        throw new BadRequestException(
          `${cartItem.product.name} (${variant.label}) is not available`,
        );
    }

    const availableStock = variant ? variant.stock : cartItem.product.stock;

    if (availableStock < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${availableStock}`,
      );
    }

    if (repointing) {
      const variantKey = variant!.id;

      // The chosen option may already sit in the cart as its own line, and the
      // (cartId, productId, variantKey) unique key forbids a second one, so
      // fold the two together instead of letting Prisma raise a P2002.
      const sibling = await this.prisma.cartItem.findUnique({
        where: {
          cartId_productId_variantKey: {
            cartId: cartItem.cartId,
            productId: cartItem.productId,
            variantKey,
          },
        },
      });

      if (sibling) {
        const merged = sibling.quantity + quantity;

        if (availableStock < merged) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${availableStock}, Current in cart: ${sibling.quantity}`,
          );
        }

        await this.prisma.$transaction([
          this.prisma.cartItem.update({
            where: { id: sibling.id },
            data: { quantity: merged },
          }),
          this.prisma.cartItem.delete({ where: { id: cartItemId } }),
        ]);

        return this.getOrCreateActiveCart(userId);
      }

      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: { quantity, variantId: variant!.id, variantKey },
      });

      return this.getOrCreateActiveCart(userId);
    }

    await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });

    return this.getOrCreateActiveCart(userId);
  }

  // Deletes one line from the cart.
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

  // Removes every line from the cart.
  async clearCart(userId: string): Promise<CartResponseDto> {
    // Resolved through the same path as every other read so a duplicate open
    // cart is folded in first, otherwise its lines reappear on the next read.
    const cart = await this.getOrCreateActiveCart(userId);

    if (cart.cartItems.length > 0) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return this.getOrCreateActiveCart(userId);
  }

  // Merges guest cart lines into the user's cart at sign-in.
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

  // Says whether a line can be ordered as it stands, and why not when it cannot.
  private lineUnavailableReason(
    item: any,
    availableStock: number,
  ): string | null {
    if (!item.product.isActive) {
      return `${item.product.name} is no longer available`;
    }

    if (item.variant && !item.variant.isActive) {
      return `${item.product.name} (${item.variant.label}) is no longer available`;
    }

    // A product can gain its first variant after the line was added, which
    // strands the line: it prices off the now-ignored product columns and every
    // later quote rejects the whole basket because of it.
    if (item.product.hasVariants && !item.variantId) {
      return `Choose an option for ${item.product.name} before ordering`;
    }

    if (availableStock < item.quantity) {
      return availableStock === 0
        ? `${item.product.name} is out of stock`
        : `Only ${availableStock} left in stock`;
    }

    return null;
  }

  // Shapes a cart row into its API response with totals.
  private formatCart(cart: any): CartResponseDto {
    const cartItems: CartItemResponseDto[] = cart.cartItems.map((item: any) => {
      const unitPrice = Number(item.variant?.price ?? item.product.price);
      const availableStock: number = item.variant
        ? item.variant.stock
        : item.product.stock;
      const unavailableReason = this.lineUnavailableReason(
        item,
        availableStock,
      );

      return {
        id: item.id,
        cartId: item.cartId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantLabel: item.variant?.label ?? null,
        quantity: item.quantity,
        unitPrice,
        availableStock,
        isOrderable: unavailableReason === null,
        unavailableReason,
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

  // Finds or creates the cart row that has not been checked out yet.
  async getOrCreateActiveCart(userId: string) {
    const carts = await this.prisma.cart.findMany({
      where: { userId, checkedOut: false },
      // Newest first, matching orders.service.create: an unordered read could
      // hand the shopper one open cart while checkout closes another.
      orderBy: { createdAt: 'desc' },
      include: {
        cartItems: { include: { product: true, variant: true } },
      },
    });

    if (carts.length > 1) {
      return this.formatCart(await this.absorbDuplicateCarts(carts));
    }

    const cart =
      carts[0] ??
      (await this.prisma.cart.create({
        data: { userId },
        include: {
          cartItems: { include: { product: true, variant: true } },
        },
      }));

    return this.formatCart(cart);
  }

  // Nothing stops two concurrent first reads from each creating an open cart,
  // so fold any stray into the newest one — the row checkout will act on.
  private async absorbDuplicateCarts(carts: any[]) {
    const [canonical, ...strays] = carts;

    for (const stray of strays) {
      for (const item of stray.cartItems) {
        await this.prisma.cartItem.upsert({
          where: {
            cartId_productId_variantKey: {
              cartId: canonical.id,
              productId: item.productId,
              variantKey: item.variantKey,
            },
          },
          create: {
            cartId: canonical.id,
            productId: item.productId,
            variantId: item.variantId,
            variantKey: item.variantKey,
            quantity: item.quantity,
          },
          update: { quantity: { increment: item.quantity } },
        });
      }

      await this.prisma.cartItem.deleteMany({ where: { cartId: stray.id } });
      // Closed rather than deleted: an Order row may still reference it.
      await this.prisma.cart.update({
        where: { id: stray.id },
        data: { checkedOut: true },
      });
    }

    const merged = await this.prisma.cart.findUnique({
      where: { id: canonical.id },
      include: { cartItems: { include: { product: true, variant: true } } },
    });

    return merged ?? canonical;
  }
}
