import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import axiosClient from '../api/axiosClient';
import { useCartStore } from './useCartStore';
import type { Cart, CartItem, Product } from '../types/api';

vi.mock('../api/axiosClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: (_error: unknown, fallback = 'Something went wrong') => fallback,
}));

const mockGet = axiosClient.get as unknown as Mock;

const line = (id: string, quantity: number): CartItem =>
  ({
    id,
    productId: 'prod-' + id,
    quantity,
    unitPrice: 25,
    product: { id: 'prod-' + id, name: 'Tee ' + id } as Product,
  }) as CartItem;

const cartOf = (items: CartItem[], totals: Partial<Cart> = {}): Cart =>
  ({
    id: 'cart-1',
    userId: 'user-1',
    cartItems: items,
    totalPrice: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    ...totals,
  }) as Cart;

beforeEach(() => {
  // Zustand stores are real singletons; hand each test an empty one.
  useCartStore.setState({ cart: null, totalItems: 0, error: null });
  mockGet.mockReset();
});

describe('useCartStore.fetchCart', () => {
  it('puts the cart and its item count in the store', async () => {
    const cart = cartOf([line('a', 2), line('b', 3)]);
    mockGet.mockResolvedValue(cart);

    await useCartStore.getState().fetchCart();

    expect(mockGet).toHaveBeenCalledWith('/cart');
    expect(useCartStore.getState().cart).toEqual(cart);
    expect(useCartStore.getState().totalItems).toBe(5);
  });

  it('counts an empty cart as zero items', async () => {
    mockGet.mockResolvedValue(cartOf([]));

    await useCartStore.getState().fetchCart();

    expect(useCartStore.getState().cart?.cartItems).toEqual([]);
    expect(useCartStore.getState().totalItems).toBe(0);
  });

  it('falls back to zero when the API omits the item count', async () => {
    mockGet.mockResolvedValue(cartOf([line('a', 2)], { totalItems: undefined as unknown as number }));

    await useCartStore.getState().fetchCart();

    expect(useCartStore.getState().totalItems).toBe(0);
  });

  it('keeps the loaded cart when a refetch fails instead of rendering the read error as an empty basket', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loaded = cartOf([line('a', 4)]);
    useCartStore.setState({ cart: loaded, totalItems: 4 });

    mockGet.mockRejectedValue({ statusCode: 500, message: 'Internal server error' });

    await expect(useCartStore.getState().fetchCart()).resolves.toBeUndefined();

    expect(useCartStore.getState().cart).toEqual(loaded);
    expect(useCartStore.getState().totalItems).toBe(4);
    expect(useCartStore.getState().error).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('clears the error flag once a later fetch succeeds', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGet.mockRejectedValueOnce({ statusCode: 500, message: 'Internal server error' });
    await useCartStore.getState().fetchCart();
    expect(useCartStore.getState().error).toBeTruthy();

    mockGet.mockResolvedValueOnce(cartOf([line('a', 1)]));
    await useCartStore.getState().fetchCart();

    expect(useCartStore.getState().error).toBeNull();
    expect(useCartStore.getState().totalItems).toBe(1);
    consoleError.mockRestore();
  });

  it('swallows the failure rather than rejecting into the caller', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGet.mockRejectedValue(new Error('Network Error'));

    await expect(useCartStore.getState().fetchCart()).resolves.toBeUndefined();

    expect(useCartStore.getState().cart).toBeNull();
    consoleError.mockRestore();
  });

  it('replaces the previous cart on a refetch instead of merging into it', async () => {
    mockGet.mockResolvedValueOnce(cartOf([line('a', 2)]));
    await useCartStore.getState().fetchCart();

    mockGet.mockResolvedValueOnce(cartOf([line('c', 1)]));
    await useCartStore.getState().fetchCart();

    expect(useCartStore.getState().cart?.cartItems.map((i) => i.id)).toEqual(['c']);
    expect(useCartStore.getState().totalItems).toBe(1);
  });
});
