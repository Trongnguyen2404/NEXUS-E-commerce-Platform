import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CartService } from '@/modules/cart/cart.service';
import { UpdateCartItemDto } from '@/modules/cart/dto/update-cart-item.dto';
import { CartItemDto, MergeCartDto } from '@/modules/cart/dto/merge-cart.dto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import {
  aCart,
  aCartItem,
  aProduct,
  aVariant,
  money,
} from '@/common/testing/factories';

describe('CartService', () => {
  let prisma: PrismaMock;
  let cart: CartService;

  beforeEach(() => {
    prisma = createPrismaMock();
    cart = new CartService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  // A cart line the way Prisma hands it back: joined to its product and variant.
  const aLine = (over: Record<string, unknown> = {}) => ({
    ...aCartItem(),
    product: aProduct(),
    variant: null,
    ...over,
  });

  const givenOpenCart = (over: Record<string, unknown> = {}) => {
    const row = aCart(over);
    prisma.cart.findMany.mockResolvedValue([row] as never);
    return row;
  };

  const givenNoCart = () => {
    prisma.cart.findMany.mockResolvedValue([] as never);
    prisma.cart.create.mockResolvedValue(aCart() as never);
  };

  const givenProduct = (over: Record<string, unknown> = {}) => {
    const product = aProduct(over);
    prisma.product.findUnique.mockResolvedValue(product as never);
    return product;
  };

  const givenVariant = (over: Record<string, unknown> = {}) => {
    const variant = aVariant(over);
    prisma.productVariant.findFirst.mockResolvedValue(variant as never);
    return variant;
  };

  // addToCart writes through one atomic upsert, so what a test stubs is the row
  // as it stands once the increment has landed.
  const givenLineAfterWrite = (
    quantity: number,
    over: Record<string, unknown> = {},
  ) => {
    const line = aCartItem({ quantity, ...over });
    prisma.cartItem.upsert.mockResolvedValue(line as never);
    return line;
  };

  describe('getOrCreateCart', () => {
    it('creates an empty cart the first time a shopper asks for one', async () => {
      givenNoCart();

      const result = await cart.getOrCreateCart('user-1');

      expect(prisma.cart.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'user-1' } }),
      );
      expect(result.id).toBe('cart-1');
      expect(result.cartItems).toEqual([]);
      expect(result.totalItems).toBe(0);
      expect(result.totalPrice).toBe(0);
    });

    it('reuses the open cart instead of creating a second one', async () => {
      givenOpenCart({ cartItems: [aLine({ quantity: 2 })] });

      const result = await cart.getOrCreateCart('user-1');

      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(result.totalItems).toBe(2);
    });

    it('ignores carts that have already been checked out', async () => {
      givenOpenCart();

      await cart.getOrCreateCart('user-1');

      // The scoping is the contract: a checked-out cart must never be reopened.
      expect(prisma.cart.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', checkedOut: false },
        }),
      );
    });

    // orders.service.create checks out the newest open cart. Reading in any
    // other order let checkout close a different cart than /cart returned, so
    // the shopper's items survived the purchase and could be ordered again.
    it('resolves the newest open cart, the same one checkout acts on', async () => {
      givenOpenCart();

      await cart.getOrCreateCart('user-1');

      expect(prisma.cart.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  // Two concurrent first reads can each create an open cart, since no unique
  // index forbids it. Whatever landed in the stray has to be folded into the
  // row checkout will act on, or the purchase silently leaves it behind.
  describe('duplicate open carts', () => {
    const givenTwoOpenCarts = () => {
      const newest = aCart({ id: 'cart-new', cartItems: [] });
      const stray = aCart({
        id: 'cart-old',
        cartItems: [aLine({ id: 'ci-stray', cartId: 'cart-old', quantity: 2 })],
      });
      prisma.cart.findMany.mockResolvedValue([newest, stray] as never);
      prisma.cart.findUnique.mockResolvedValue(
        aCart({
          id: 'cart-new',
          cartItems: [
            aLine({ id: 'ci-moved', cartId: 'cart-new', quantity: 2 }),
          ],
        }) as never,
      );
      return { newest, stray };
    };

    it('folds a stray cart line into the newest cart', async () => {
      givenTwoOpenCarts();

      const result = await cart.getOrCreateCart('user-1');

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cartId_productId_variantKey: {
              cartId: 'cart-new',
              productId: 'prod-1',
              variantKey: '',
            },
          },
          update: { quantity: { increment: 2 } },
        }),
      );
      expect(result.id).toBe('cart-new');
      expect(result.totalItems).toBe(2);
    });

    it('closes the stray cart once its lines have moved', async () => {
      givenTwoOpenCarts();

      await cart.getOrCreateCart('user-1');

      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: 'cart-old' },
      });
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-old' },
        data: { checkedOut: true },
      });
    });

    it('does not create yet another cart when duplicates are found', async () => {
      givenTwoOpenCarts();

      await cart.getOrCreateCart('user-1');

      expect(prisma.cart.create).not.toHaveBeenCalled();
    });
  });

  describe('the shape of a returned cart', () => {
    it('prices a line from its variant rather than its product', async () => {
      givenOpenCart({
        cartItems: [
          aLine({
            quantity: 2,
            variantId: 'var-1',
            variantKey: 'var-1',
            product: aProduct({ price: money(100), stock: 10 }),
            variant: aVariant({
              price: money(120),
              stock: 5,
              label: 'Black / M',
            }),
          }),
        ],
      });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.cartItems[0].unitPrice).toBe(120);
      expect(result.cartItems[0].variantId).toBe('var-1');
      expect(result.cartItems[0].variantLabel).toBe('Black / M');
      expect(result.totalPrice).toBe(240);
    });

    it('falls back to the product price when the variant carries none', async () => {
      givenOpenCart({
        cartItems: [
          aLine({
            variantId: 'var-1',
            product: aProduct({ price: money(80) }),
            variant: aVariant({ price: null }),
          }),
        ],
      });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.cartItems[0].unitPrice).toBe(80);
    });

    it('leaves the variant fields null on a plain product line', async () => {
      givenOpenCart({ cartItems: [aLine()] });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.cartItems[0].variantId).toBeNull();
      expect(result.cartItems[0].variantLabel).toBeNull();
    });

    it('reports the variant stock as what is available on a variant line', async () => {
      givenOpenCart({
        cartItems: [
          aLine({
            variantId: 'var-1',
            product: aProduct({ stock: 999 }),
            variant: aVariant({ stock: 3 }),
          }),
        ],
      });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.cartItems[0].availableStock).toBe(3);
    });

    it('reports the product stock as what is available on a plain line', async () => {
      givenOpenCart({
        cartItems: [aLine({ product: aProduct({ stock: 7 }) })],
      });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.cartItems[0].availableStock).toBe(7);
    });

    it('exposes the product price as a number, not a Decimal', async () => {
      givenOpenCart({
        cartItems: [aLine({ product: aProduct({ price: money(49.5) }) })],
      });

      const result = await cart.getOrCreateCart('user-1');

      expect(typeof result.cartItems[0].product.price).toBe('number');
      expect(result.cartItems[0].product.price).toBe(49.5);
    });

    it('totals every line by unit price times quantity', async () => {
      givenOpenCart({
        cartItems: [
          aLine({
            id: 'ci-1',
            quantity: 2,
            product: aProduct({ price: money(100) }),
          }),
          aLine({
            id: 'ci-2',
            quantity: 1,
            variantId: 'var-1',
            variantKey: 'var-1',
            product: aProduct({ price: money(100) }),
            variant: aVariant({ price: money(120) }),
          }),
        ],
      });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.totalPrice).toBe(320);
      expect(result.totalItems).toBe(3);
    });

    it('totals an empty cart as zero rather than leaving it undefined', async () => {
      givenOpenCart({ cartItems: [] });

      const result = await cart.getOrCreateCart('user-1');

      expect(result.totalPrice).toBe(0);
      expect(result.totalItems).toBe(0);
    });
  });

  // A line can go bad after it was added — the product is deactivated, the
  // option is retired, or the product gains its first variant. The cart used to
  // render all of those as ordinary lines and the shopper only found out when
  // checkout rejected the entire basket without naming the line at fault.
  describe('whether a line can still be ordered', () => {
    const lineFrom = async (over: Record<string, unknown>) => {
      givenOpenCart({ cartItems: [aLine(over)] });
      const result = await cart.getOrCreateCart('user-1');
      return result.cartItems[0];
    };

    it('marks an ordinary line orderable with no reason attached', async () => {
      const line = await lineFrom({
        quantity: 2,
        product: aProduct({ stock: 5 }),
      });

      expect(line.isOrderable).toBe(true);
      expect(line.unavailableReason).toBeNull();
    });

    it('flags a line stranded when its product gained its first variant', async () => {
      const line = await lineFrom({
        variantId: null,
        product: aProduct({ hasVariants: true, name: 'T-Shirt' }),
      });

      expect(line.isOrderable).toBe(false);
      expect(line.unavailableReason).toBe(
        'Choose an option for T-Shirt before ordering',
      );
    });

    it('flags a line whose product was deactivated', async () => {
      const line = await lineFrom({
        product: aProduct({ isActive: false, name: 'T-Shirt' }),
      });

      expect(line.isOrderable).toBe(false);
      expect(line.unavailableReason).toBe('T-Shirt is no longer available');
    });

    it('flags a line whose option was retired', async () => {
      const line = await lineFrom({
        variantId: 'var-1',
        variantKey: 'var-1',
        product: aProduct({ hasVariants: true, name: 'T-Shirt' }),
        variant: aVariant({ isActive: false, label: 'M', stock: 5 }),
      });

      expect(line.isOrderable).toBe(false);
      expect(line.unavailableReason).toBe('T-Shirt (M) is no longer available');
    });

    it('flags a line that now asks for more than is left', async () => {
      const line = await lineFrom({
        quantity: 4,
        product: aProduct({ stock: 2 }),
      });

      expect(line.isOrderable).toBe(false);
      expect(line.unavailableReason).toBe('Only 2 left in stock');
    });

    it('flags a line whose product sold out entirely', async () => {
      const line = await lineFrom({
        quantity: 1,
        product: aProduct({ stock: 0, name: 'T-Shirt' }),
      });

      expect(line.isOrderable).toBe(false);
      expect(line.unavailableReason).toBe('T-Shirt is out of stock');
    });
  });

  describe('addToCart', () => {
    it('rejects a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null as never);

      await expect(
        cart.addToCart('user-1', { productId: 'ghost', quantity: 1 }),
      ).rejects.toThrow(new NotFoundException('Product not found'));
    });

    it('rejects a product that has been deactivated', async () => {
      givenProduct({ isActive: false });

      await expect(
        cart.addToCart('user-1', { productId: 'prod-1', quantity: 1 }),
      ).rejects.toThrow(new BadRequestException('Product is not available'));
    });

    it('requires an option when the product sells in variants', async () => {
      givenProduct({ hasVariants: true, name: 'DeskLink' });

      await expect(
        cart.addToCart('user-1', { productId: 'prod-1', quantity: 1 }),
      ).rejects.toThrow('Choose an option for DeskLink first');
    });

    it('rejects an option on a product that has none', async () => {
      givenProduct({ hasVariants: false, name: 'Plain Mouse' });

      await expect(
        cart.addToCart('user-1', {
          productId: 'prod-1',
          quantity: 1,
          variantId: 'var-1',
        }),
      ).rejects.toThrow('Plain Mouse does not have options to choose from');
    });

    it('rejects a variant that belongs to a different product', async () => {
      givenProduct({ hasVariants: true });
      prisma.productVariant.findFirst.mockResolvedValue(null as never);

      await expect(
        cart.addToCart('user-1', {
          productId: 'prod-1',
          quantity: 1,
          variantId: 'someone-elses',
        }),
      ).rejects.toThrow('That option is not available');

      // The lookup must be scoped to the product, not just the variant id.
      expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
        where: { id: 'someone-elses', productId: 'prod-1' },
      });
    });

    it('rejects a variant that has been deactivated', async () => {
      givenProduct({ hasVariants: true, name: 'DeskLink' });
      givenVariant({ isActive: false, label: '10-in-1' });

      await expect(
        cart.addToCart('user-1', {
          productId: 'prod-1',
          quantity: 1,
          variantId: 'var-1',
        }),
      ).rejects.toThrow('DeskLink (10-in-1) is not available');
    });

    it('rejects more units than the product has in stock', async () => {
      givenProduct({ stock: 2 });

      await expect(
        cart.addToCart('user-1', { productId: 'prod-1', quantity: 3 }),
      ).rejects.toThrow('Insufficient stock. Available: 2');
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    // mergeCart forwards guest lines straight in here, bypassing the DTO, so
    // the quantity floor has to hold in the service too: `stock < -5` is false,
    // which used to write a negative line and a negative cart total.
    it.each([0, -5, 2.5, Number.NaN])(
      'refuses a quantity of %p before writing anything',
      async (quantity) => {
        givenProduct({ stock: 10 });
        givenOpenCart();

        await expect(
          cart.addToCart('user-1', { productId: 'prod-1', quantity }),
        ).rejects.toThrow('Quantity must be at least 1');
        expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
      },
    );

    it('allows taking exactly the last units in stock', async () => {
      givenProduct({ stock: 3 });
      givenOpenCart();
      givenLineAfterWrite(3);

      await cart.addToCart('user-1', { productId: 'prod-1', quantity: 3 });

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ quantity: 3 }),
        }),
      );
    });

    it('measures stock against the variant, not the product', async () => {
      givenProduct({ hasVariants: true, stock: 999 });
      givenVariant({ stock: 1 });

      await expect(
        cart.addToCart('user-1', {
          productId: 'prod-1',
          quantity: 2,
          variantId: 'var-1',
        }),
      ).rejects.toThrow('Insufficient stock. Available: 1');
    });

    it('creates a plain line with an empty variant key', async () => {
      givenProduct({ stock: 10 });
      givenOpenCart();
      givenLineAfterWrite(2);

      await cart.addToCart('user-1', { productId: 'prod-1', quantity: 2 });

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: {
          cartId_productId_variantKey: {
            cartId: 'cart-1',
            productId: 'prod-1',
            variantKey: '',
          },
        },
        create: {
          cartId: 'cart-1',
          productId: 'prod-1',
          variantId: null,
          variantKey: '',
          quantity: 2,
        },
        update: { quantity: { increment: 2 } },
      });
    });

    it('keys a variant line by the variant id so one product can sit in the cart once per option', async () => {
      givenProduct({ hasVariants: true, stock: 10 });
      givenVariant({ id: 'var-9', stock: 4 });
      givenOpenCart();
      givenLineAfterWrite(1, { variantId: 'var-9', variantKey: 'var-9' });

      await cart.addToCart('user-1', {
        productId: 'prod-1',
        quantity: 1,
        variantId: 'var-9',
      });

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cartId_productId_variantKey: {
              cartId: 'cart-1',
              productId: 'prod-1',
              variantKey: 'var-9',
            },
          },
          create: {
            cartId: 'cart-1',
            productId: 'prod-1',
            variantId: 'var-9',
            variantKey: 'var-9',
            quantity: 1,
          },
        }),
      );
    });

    // Regression: reading the line and writing the sum back let two concurrent
    // adds both store the total they read, so one add vanished — and when the
    // line did not exist yet, both took the create branch and the second
    // collided with the unique key. The increment has to be the write itself.
    it('bumps an existing line with an atomic increment rather than a read-then-write', async () => {
      givenProduct({ stock: 10 });
      givenOpenCart();
      givenLineAfterWrite(5, { id: 'ci-7' });

      await cart.addToCart('user-1', { productId: 'prod-1', quantity: 3 });

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: { increment: 3 } } }),
      );
      expect(prisma.cartItem.findUnique).not.toHaveBeenCalled();
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('refuses a bump past the stock ceiling and says how many are already in the cart', async () => {
      givenProduct({ stock: 5 });
      givenOpenCart();
      // 4 already in the cart, so the increment of 2 lands on 6.
      givenLineAfterWrite(6, { id: 'ci-7' });

      await expect(
        cart.addToCart('user-1', { productId: 'prod-1', quantity: 2 }),
      ).rejects.toThrow('Insufficient stock. Available: 5, Current in cart: 4');
    });

    // The ceiling can only be judged once the increment has landed, so it has
    // to be taken back — with the mirror decrement, since an absolute write
    // would clobber a concurrent add that slipped in between.
    it('takes an overshooting increment back with a decrement', async () => {
      givenProduct({ stock: 5 });
      givenOpenCart();
      givenLineAfterWrite(6, { id: 'ci-7' });

      await expect(
        cart.addToCart('user-1', { productId: 'prod-1', quantity: 2 }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-7' },
        data: { quantity: { decrement: 2 } },
      });
    });

    it('allows a bump that lands exactly on the stock ceiling', async () => {
      givenProduct({ stock: 5 });
      givenOpenCart();
      givenLineAfterWrite(5, { id: 'ci-7' });

      await cart.addToCart('user-1', { productId: 'prod-1', quantity: 1 });

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: { increment: 1 } } }),
      );
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('creates the cart first when the shopper has never had one', async () => {
      givenProduct({ stock: 10 });
      givenNoCart();
      givenLineAfterWrite(1);

      await cart.addToCart('user-1', { productId: 'prod-1', quantity: 1 });

      expect(prisma.cart.create).toHaveBeenCalled();
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ cartId: 'cart-1' }),
        }),
      );
    });

    it('returns the cart as it stands after the line was written', async () => {
      givenProduct({ stock: 10, price: money(100) });
      prisma.cart.findMany
        .mockResolvedValueOnce([aCart()] as never)
        .mockResolvedValueOnce([
          aCart({ cartItems: [aLine({ quantity: 2 })] }),
        ] as never);
      givenLineAfterWrite(2);

      const result = await cart.addToCart('user-1', {
        productId: 'prod-1',
        quantity: 2,
      });

      expect(result.totalItems).toBe(2);
      expect(result.totalPrice).toBe(200);
    });
  });

  describe('updateCartItem', () => {
    const givenLine = (over: Record<string, unknown> = {}) => {
      const line = {
        ...aLine(over),
        cart: aCart({ cartItems: undefined }),
        ...over,
      };
      prisma.cartItem.findUnique.mockResolvedValue(line as never);
      return line;
    };

    it('rejects a cart item that does not exist', async () => {
      prisma.cartItem.findUnique.mockResolvedValue(null as never);

      await expect(
        cart.updateCartItem('user-1', 'ghost', { quantity: 1 }),
      ).rejects.toThrow(new NotFoundException('Cart item not found'));
    });

    it('refuses to touch a cart item belonging to another shopper', async () => {
      givenLine({ cart: aCart({ userId: 'someone-else' }) });

      await expect(
        cart.updateCartItem('user-1', 'ci-1', { quantity: 1 }),
      ).rejects.toThrow('Cart item not found');
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('rejects a quantity above the available stock', async () => {
      givenLine({ product: aProduct({ stock: 4 }) });

      await expect(
        cart.updateCartItem('user-1', 'ci-1', { quantity: 5 }),
      ).rejects.toThrow('Insufficient stock. Available: 4');
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('measures stock against the variant when the line has one', async () => {
      givenLine({
        product: aProduct({ stock: 100 }),
        variant: aVariant({ stock: 2 }),
      });

      await expect(
        cart.updateCartItem('user-1', 'ci-1', { quantity: 3 }),
      ).rejects.toThrow('Insufficient stock. Available: 2');
    });

    it('allows a quantity that lands exactly on the stock ceiling', async () => {
      givenLine({ product: aProduct({ stock: 4 }) });
      givenOpenCart();

      await cart.updateCartItem('user-1', 'ci-1', { quantity: 4 });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-1' },
        data: { quantity: 4 },
      });
    });

    it('saves the new quantity and returns the refreshed cart', async () => {
      givenLine({ product: aProduct({ stock: 10 }) });
      givenOpenCart({
        cartItems: [
          aLine({ quantity: 3, product: aProduct({ price: money(100) }) }),
        ],
      });

      const result = await cart.updateCartItem('user-1', 'ci-1', {
        quantity: 3,
      });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-1' },
        data: { quantity: 3 },
      });
      expect(result.totalItems).toBe(3);
      expect(result.totalPrice).toBe(300);
    });
  });

  // The repair path for a line stranded by a product that gained options after
  // it was added: the line blocks every quote, and quantity was the only thing
  // the shopper could change, so deleting it was the only way out.
  describe('re-pointing a cart line at an option', () => {
    const givenStrandedLine = () => {
      prisma.cartItem.findUnique.mockResolvedValueOnce({
        ...aCartItem({ variantId: null, variantKey: '' }),
        cart: aCart({ cartItems: undefined }),
        product: aProduct({ hasVariants: true, name: 'T-Shirt' }),
        variant: null,
      } as never);
      givenOpenCart({ cartItems: [] });
    };

    it('writes the chosen option onto the line', async () => {
      givenStrandedLine();
      givenVariant({ id: 'var-9', stock: 5 });
      prisma.cartItem.findUnique.mockResolvedValueOnce(null as never);

      await cart.updateCartItem('user-1', 'ci-1', {
        quantity: 2,
        variantId: 'var-9',
      });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-1' },
        data: { quantity: 2, variantId: 'var-9', variantKey: 'var-9' },
      });
    });

    it('folds the line into the line that already holds that option', async () => {
      givenStrandedLine();
      givenVariant({ id: 'var-9', stock: 5 });
      prisma.cartItem.findUnique.mockResolvedValueOnce(
        aCartItem({ id: 'ci-sibling', quantity: 2 }) as never,
      );

      await cart.updateCartItem('user-1', 'ci-1', {
        quantity: 1,
        variantId: 'var-9',
      });

      // The unique key allows only one line per option, so the two merge.
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-sibling' },
        data: { quantity: 3 },
      });
      expect(prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'ci-1' },
      });
    });

    it('rejects an option that belongs to another product', async () => {
      givenStrandedLine();
      prisma.productVariant.findFirst.mockResolvedValue(null as never);

      await expect(
        cart.updateCartItem('user-1', 'ci-1', {
          quantity: 1,
          variantId: 'someone-elses',
        }),
      ).rejects.toThrow('That option is not available');
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('rejects a retired option', async () => {
      givenStrandedLine();
      givenVariant({ id: 'var-9', isActive: false, label: 'M', stock: 5 });

      await expect(
        cart.updateCartItem('user-1', 'ci-1', {
          quantity: 1,
          variantId: 'var-9',
        }),
      ).rejects.toThrow('T-Shirt (M) is not available');
    });

    it('measures the new quantity against the chosen option stock', async () => {
      givenStrandedLine();
      givenVariant({ id: 'var-9', stock: 2 });

      await expect(
        cart.updateCartItem('user-1', 'ci-1', {
          quantity: 3,
          variantId: 'var-9',
        }),
      ).rejects.toThrow('Insufficient stock. Available: 2');
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('rejects an option on a product that has none', async () => {
      prisma.cartItem.findUnique.mockResolvedValueOnce({
        ...aCartItem(),
        cart: aCart({ cartItems: undefined }),
        product: aProduct({ hasVariants: false, name: 'Plain Mouse' }),
        variant: null,
      } as never);

      await expect(
        cart.updateCartItem('user-1', 'ci-1', {
          quantity: 1,
          variantId: 'var-9',
        }),
      ).rejects.toThrow('Plain Mouse does not have options to choose from');
    });
  });

  // The quantity floor lives on the DTO: the service trusts the global
  // ValidationPipe, so the rule is exercised where it is actually enforced.
  describe('the quantity floor on UpdateCartItemDto', () => {
    const errorsFor = (quantity: unknown) =>
      validateSync(plainToInstance(UpdateCartItemDto, { quantity }));

    it.each([0, -1, -100])('rejects a quantity of %p', (quantity) => {
      const errors = errorsFor(quantity);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('accepts a quantity of one', () => {
      expect(errorsFor(1)).toHaveLength(0);
    });

    it('rejects a quantity that is not a number at all', () => {
      const errors = errorsFor('two');
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isInt');
    });

    it('rejects a fractional quantity the Int column cannot hold', () => {
      const errors = errorsFor(1.5);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isInt');
    });
  });

  // Regression: MergeCartDto.items carried only @IsArray(), so class-validator
  // never descended into the elements and every rule below was dead code — a
  // guest cart could post any quantity it liked straight through to the service.
  describe('the guest lines on MergeCartDto', () => {
    const errorsFor = (items: unknown) =>
      validateSync(plainToInstance(MergeCartDto, { items }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it.each([0, -5])(
      'rejects a guest line with a quantity of %p',
      (quantity) => {
        const errors = errorsFor([{ productId: 'prod-1', quantity }]);

        expect(errors).toHaveLength(1);
        expect(
          errors[0].children?.[0].children?.[0].constraints,
        ).toHaveProperty('min');
      },
    );

    it('rejects a guest quantity that is not a number', () => {
      const errors = errorsFor([{ productId: 'prod-1', quantity: 'abc' }]);

      expect(errors).toHaveLength(1);
      expect(errors[0].children?.[0].children?.[0].constraints).toHaveProperty(
        'isInt',
      );
    });

    it('rejects a guest line with no product id', () => {
      const errors = errorsFor([{ productId: '', quantity: 1 }]);

      expect(errors).toHaveLength(1);
    });

    it('rejects more guest lines than one merge should carry', () => {
      const errors = errorsFor(
        Array.from({ length: 101 }, () => ({
          productId: 'prod-1',
          quantity: 1,
        })),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
    });

    it('accepts a well-formed guest cart and keeps its fields', () => {
      const dto = plainToInstance(MergeCartDto, {
        items: [{ productId: 'prod-1', quantity: 2 }],
      });

      expect(validateSync(dto)).toHaveLength(0);
      // Without @Type the elements come back as bare arrays, losing the payload.
      expect(dto.items[0]).toBeInstanceOf(CartItemDto);
      expect(dto.items[0].quantity).toBe(2);
      expect(dto.items[0].productId).toBe('prod-1');
    });
  });

  describe('removeFromCart', () => {
    it('rejects a cart item that does not exist', async () => {
      prisma.cartItem.findUnique.mockResolvedValue(null as never);

      await expect(cart.removeFromCart('user-1', 'ghost')).rejects.toThrow(
        new NotFoundException('Cart item not found'),
      );
    });

    it('refuses to delete a cart item belonging to another shopper', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        ...aCartItem(),
        cart: aCart({ userId: 'someone-else' }),
      } as never);

      await expect(cart.removeFromCart('user-1', 'ci-1')).rejects.toThrow(
        'Cart item not found',
      );
      expect(prisma.cartItem.delete).not.toHaveBeenCalled();
    });

    it('deletes the line and returns the cart without it', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        ...aCartItem(),
        cart: aCart(),
      } as never);
      givenOpenCart({ cartItems: [] });

      const result = await cart.removeFromCart('user-1', 'ci-1');

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'ci-1' },
      });
      expect(result.cartItems).toEqual([]);
      expect(result.totalItems).toBe(0);
    });
  });

  describe('clearCart', () => {
    it('deletes every line of the open cart', async () => {
      prisma.cart.findMany
        .mockResolvedValueOnce([aCart({ cartItems: [aLine()] })] as never)
        .mockResolvedValueOnce([aCart({ cartItems: [] })] as never);

      const result = await cart.clearCart('user-1');

      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: 'cart-1' },
      });
      expect(result.totalItems).toBe(0);
      expect(result.totalPrice).toBe(0);
    });

    it('deletes nothing when the shopper has no cart yet', async () => {
      givenNoCart();

      const result = await cart.clearCart('user-1');

      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(result.cartItems).toEqual([]);
    });
  });

  describe('mergeCart', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('returns the cart untouched when the guest cart is empty', async () => {
      givenOpenCart({ cartItems: [] });

      const result = await cart.mergeCart('user-1', []);

      expect(prisma.product.findUnique).not.toHaveBeenCalled();
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
      expect(result.totalItems).toBe(0);
    });

    it('returns the cart untouched when no guest items are supplied at all', async () => {
      givenOpenCart({ cartItems: [] });

      const result = await cart.mergeCart(
        'user-1',
        undefined as unknown as { productId: string; quantity: number }[],
      );

      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
      expect(result.totalItems).toBe(0);
    });

    it('folds every guest line into the cart', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce(aProduct({ id: 'prod-1', stock: 10 }) as never)
        .mockResolvedValueOnce(aProduct({ id: 'prod-2', stock: 10 }) as never);
      givenOpenCart();
      givenLineAfterWrite(4);

      await cart.mergeCart('user-1', [
        { productId: 'prod-1', quantity: 1 },
        { productId: 'prod-2', quantity: 4 },
      ]);

      expect(prisma.cartItem.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ productId: 'prod-1', quantity: 1 }),
        }),
      );
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ productId: 'prod-2', quantity: 4 }),
        }),
      );
    });

    it('adds a guest line onto the quantity already in the cart', async () => {
      givenProduct({ stock: 10 });
      givenOpenCart();
      givenLineAfterWrite(5, { id: 'ci-7' });

      await cart.mergeCart('user-1', [{ productId: 'prod-1', quantity: 3 }]);

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: { increment: 3 } } }),
      );
    });

    it('combines two guest lines of the same product into a single line', async () => {
      givenProduct({ stock: 10 });
      givenOpenCart();
      prisma.cartItem.upsert
        .mockResolvedValueOnce(aCartItem({ id: 'ci-7', quantity: 1 }) as never)
        .mockResolvedValueOnce(aCartItem({ id: 'ci-7', quantity: 3 }) as never);

      await cart.mergeCart('user-1', [
        { productId: 'prod-1', quantity: 1 },
        { productId: 'prod-1', quantity: 2 },
      ]);

      // Both lines address the same unique key, so the second one increments
      // the row the first one created instead of adding a duplicate.
      const keys = prisma.cartItem.upsert.mock.calls.map(
        (call) => (call[0] as any).where.cartId_productId_variantKey,
      );
      expect(keys).toEqual([
        { cartId: 'cart-1', productId: 'prod-1', variantKey: '' },
        { cartId: 'cart-1', productId: 'prod-1', variantKey: '' },
      ]);
      expect(prisma.cartItem.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ update: { quantity: { increment: 2 } } }),
      );
    });

    it('drops a guest line that asks for more than is in stock', async () => {
      givenProduct({ stock: 2 });
      givenOpenCart();

      await cart.mergeCart('user-1', [{ productId: 'prod-1', quantity: 5 }]);

      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    // Regression: MergeCartDto validated nothing about its elements, so a
    // guest line of -3 reached addToCart, sailed past `stock < quantity` and
    // was written straight to the cart, taking the totals negative.
    it.each([0, -3, 1.5])(
      'drops a guest line with a quantity of %p instead of writing it',
      async (quantity) => {
        givenProduct({ stock: 10 });
        givenOpenCart();

        const result = await cart.mergeCart('user-1', [
          { productId: 'prod-1', quantity },
        ]);

        expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
        expect(result.totalItems).toBe(0);
        expect(result.totalPrice).toBe(0);
      },
    );

    it('keeps merging the remaining guest lines after one of them fails', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce(aProduct({ id: 'sold-out', stock: 1 }) as never)
        .mockResolvedValueOnce(aProduct({ id: 'prod-2', stock: 10 }) as never);
      givenOpenCart();
      givenLineAfterWrite(2);

      await cart.mergeCart('user-1', [
        { productId: 'sold-out', quantity: 5 },
        { productId: 'prod-2', quantity: 2 },
      ]);

      expect(prisma.cartItem.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ productId: 'prod-2', quantity: 2 }),
        }),
      );
    });

    it('drops a guest line whose product no longer exists', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(aProduct({ id: 'prod-2', stock: 10 }) as never);
      givenOpenCart();
      givenLineAfterWrite(1);

      await cart.mergeCart('user-1', [
        { productId: 'deleted', quantity: 1 },
        { productId: 'prod-2', quantity: 1 },
      ]);

      expect(prisma.cartItem.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ productId: 'prod-2' }),
        }),
      );
    });

    it('returns the merged cart with its totals', async () => {
      givenProduct({ stock: 10, price: money(100) });
      prisma.cart.findMany
        .mockResolvedValueOnce([aCart()] as never)
        .mockResolvedValueOnce([aCart()] as never)
        .mockResolvedValueOnce([
          aCart({ cartItems: [aLine({ quantity: 2 })] }),
        ] as never);
      givenLineAfterWrite(2);

      const result = await cart.mergeCart('user-1', [
        { productId: 'prod-1', quantity: 2 },
      ]);

      expect(result.totalItems).toBe(2);
      expect(result.totalPrice).toBe(200);
    });
  });
});
