import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import Cart from './Cart';
import axiosClient from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';
import { toast } from 'react-toastify';
import type { Cart as CartModel, CartItem, Product, Quote } from '../types/api';

// ---------------------------------------------------------------- mocks

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../api/axiosClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  // Mirrors the real helper: the cart surfaces the server's reason, so a mock that
  // always returned the fallback would hide whether that message reaches the page.
  getErrorMessage: (error: unknown, fallback = 'Something went wrong') => {
    const message = (error as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    if (typeof message === 'string' && message.length > 0) return message;
    return fallback;
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), warning: vi.fn() },
}));

const api = axiosClient as unknown as Record<'get' | 'post' | 'patch' | 'put' | 'delete', Mock>;

// ---------------------------------------------------------------- fixtures

const product = (id: string, name: string): Product =>
  ({ id, name, imageUrl: null, category: 'Keyboards' }) as Product;

const VARIANT_LINE: CartItem = {
  id: 'line-kb',
  cartId: 'cart-1',
  productId: 'p-keyboard',
  variantId: 'v-blue-switch',
  variantLabel: 'Blue Switch / 65%',
  unitPrice: 100,
  availableStock: 9,
  quantity: 2,
  product: product('p-keyboard', 'Aurora Keyboard'),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PLAIN_LINE: CartItem = {
  ...VARIANT_LINE,
  id: 'line-mat',
  productId: 'p-desk-mat',
  variantId: null,
  variantLabel: null,
  unitPrice: 60,
  quantity: 1,
  product: product('p-desk-mat', 'Slate Desk Mat'),
};

// A server-side cart the fake endpoints mutate, so the UI sees real consequences.
let serverCart: CartModel;
// Whatever the pricing endpoint should answer with next.
let serverQuote: Quote | null;

const priced = (items: CartItem[]): CartModel => ({
  id: 'cart-1',
  userId: 'user-1',
  cartItems: items,
  totalItems: items.reduce((n, i) => n + i.quantity, 0),
  totalPrice: items.reduce((n, i) => n + Number(i.unitPrice) * i.quantity, 0),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const makeQuote = (over: Partial<Quote> = {}): Quote => ({
  items: [],
  subtotal: 260,
  discountAmount: 0,
  coupon: null,
  shippingFee: 12.5,
  freeShippingThreshold: 300,
  amountToFreeShipping: 87.25,
  taxRate: 0.08,
  taxAmount: 20.8,
  total: 293.3,
  ...over,
});

const renderCart = () =>
  render(
    <MemoryRouter initialEntries={['/cart']}>
      <Cart />
    </MemoryRouter>,
  );

// The page shows a spinner until the first fetch lands.
const waitForCart = () => screen.findByRole('heading', { name: /review your gear/i });

const idFromUrl = (url: string) => url.split('/').pop() as string;

beforeEach(() => {
  serverCart = priced([VARIANT_LINE, PLAIN_LINE]);
  serverQuote = makeQuote();
  useCartStore.setState({ cart: null, totalItems: 0, error: null });

  api.get.mockImplementation(async (url: string) => {
    if (url === '/cart') return priced(serverCart.cartItems);
    throw new Error(`unexpected GET ${url}`);
  });

  api.post.mockImplementation(async (url: string) => {
    if (url === '/orders/quote') {
      if (!serverQuote) throw new Error('nothing to price');
      return serverQuote;
    }
    throw new Error(`unexpected POST ${url}`);
  });

  api.patch.mockImplementation(async (url: string, body?: unknown) => {
    const id = idFromUrl(url);
    const { quantity } = body as { quantity: number };
    serverCart = priced(
      serverCart.cartItems.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
    return { success: true };
  });

  api.delete.mockImplementation(async (url: string) => {
    const id = idFromUrl(url);
    serverCart = priced(serverCart.cartItems.filter((item) => item.id !== id));
    return { success: true };
  });
});

// ---------------------------------------------------------------- tests

describe('Cart quantity controls', () => {
  it('raises the quantity of the line the shopper clicked', async () => {
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    await user.click(screen.getAllByRole('button', { name: '+' })[0]);

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/cart/items/line-kb', { quantity: 3 }),
    );
    // The refreshed cart is what the page shows, not an optimistic guess.
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    expect(screen.getByText('Subtotal (4 items)')).toBeInTheDocument();
  });

  it('lowers the quantity of the line the shopper clicked', async () => {
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    await user.click(screen.getAllByRole('button', { name: '-' })[0]);

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/cart/items/line-kb', { quantity: 1 }),
    );
    await waitFor(() => expect(screen.getByText('Subtotal (2 items)')).toBeInTheDocument());
  });

  it('refuses to take a line below one', async () => {
    serverCart = priced([{ ...VARIANT_LINE, quantity: 1 }]);
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    await user.click(screen.getByRole('button', { name: '-' }));

    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.getByText('Subtotal (1 items)')).toBeInTheDocument();
  });

  it('removes only the line whose Remove button was pressed', async () => {
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    await user.click(screen.getAllByRole('button', { name: /remove/i })[0]);

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/cart/items/line-kb'));
    await waitFor(() => expect(screen.queryByText(/aurora keyboard/i)).not.toBeInTheDocument());
    expect(screen.getByText(/slate desk mat/i)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Item removed from cart.');
  });
});

describe('Cart free-shipping progress', () => {
  it('reads the shortfall off the server quote', async () => {
    renderCart();
    await waitForCart();

    expect(await screen.findByText('$87.25')).toBeInTheDocument();
    expect(screen.getByText(/more for free shipping/i)).toBeInTheDocument();
    // While a shortfall remains, shipping is deferred to checkout rather than free.
    expect(screen.queryByText('Free')).not.toBeInTheDocument();

    expect(api.post).toHaveBeenCalledWith('/orders/quote', {
      items: [
        { productId: 'p-keyboard', quantity: 2, variantId: 'v-blue-switch' },
        { productId: 'p-desk-mat', quantity: 1 },
      ],
    });
  });

  it('announces free shipping when the quote says nothing is left to spend', async () => {
    serverQuote = makeQuote({ amountToFreeShipping: 0, shippingFee: 0 });
    renderCart();
    await waitForCart();

    expect(await screen.findByText('Free')).toBeInTheDocument();
    expect(screen.queryByText(/more for free shipping/i)).not.toBeInTheDocument();
  });

  it('does not invent a shortfall when the quote request fails', async () => {
    api.post.mockRejectedValue(new Error('pricing is down'));
    renderCart();
    await waitForCart();

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryByText(/more for free shipping/i)).not.toBeInTheDocument();
    // The cart's own totals still render.
    expect(screen.getAllByText('$260.00').length).toBeGreaterThan(0);
  });
});

describe('Cart shipping row', () => {
  it('does not call shipping free while the quote is still in flight', async () => {
    let release: (quote: Quote) => void = () => undefined;
    api.post.mockImplementation((url: string) => {
      if (url === '/orders/quote') return new Promise<Quote>((resolve) => { release = resolve; });
      throw new Error(`unexpected POST ${url}`);
    });

    renderCart();
    await waitForCart();

    // Nothing is known about the fee yet, so nothing may be promised.
    expect(screen.queryByText('Free')).not.toBeInTheDocument();

    await act(async () => {
      release(makeQuote({ amountToFreeShipping: 0, shippingFee: 0 }));
    });

    expect(await screen.findByText('Free')).toBeInTheDocument();
  });

  it('does not call shipping free when the quote is rejected, and shows the reason', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    api.post.mockRejectedValue({ statusCode: 400, message: 'Insufficient stock for Aurora Keyboard' });

    renderCart();
    await waitForCart();
    await waitFor(() => expect(api.post).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Insufficient stock for Aurora Keyboard'),
    );
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
    expect(screen.queryByText(/more for free shipping/i)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe('Cart load failure', () => {
  it('offers a retry instead of the empty-cart screen when the cart request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    api.get.mockRejectedValue({ statusCode: 500, message: 'Internal server error' });

    renderCart();

    expect(
      await screen.findByRole('heading', { name: /couldn't load your cart/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /your cart is empty/i })).not.toBeInTheDocument();
    expect(screen.getByText('Internal server error')).toBeInTheDocument();

    // Retrying reads the basket the server still holds.
    api.get.mockImplementation(async () => priced(serverCart.cartItems));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitForCart();
    expect(screen.getByText(/aurora keyboard/i)).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('keeps the basket on screen when a refetch fails mid-session', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    // The line delete succeeds, the refetch behind it does not.
    api.get.mockRejectedValue({ statusCode: 500, message: 'Internal server error' });
    await user.click(screen.getAllByRole('button', { name: /remove/i })[0]);

    await waitFor(() => expect(useCartStore.getState().error).toBeTruthy());
    expect(screen.queryByRole('heading', { name: /your cart is empty/i })).not.toBeInTheDocument();
    expect(screen.getByText(/aurora keyboard/i)).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe('Cart empty state', () => {
  it('offers a way back to the catalogue and prices nothing', async () => {
    serverCart = priced([]);
    renderCart();

    expect(await screen.findByRole('heading', { name: /your cart is empty/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue shopping/i })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.queryByRole('button', { name: /proceed to checkout/i })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('empties out once the last line is removed', async () => {
    serverCart = priced([VARIANT_LINE]);
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    await user.click(screen.getByRole('button', { name: /remove/i }));

    expect(await screen.findByRole('heading', { name: /your cart is empty/i })).toBeInTheDocument();
  });
});

describe('Cart checkout hand-off', () => {
  it('sends the shopper to checkout', async () => {
    const user = userEvent.setup();
    renderCart();
    await waitForCart();

    await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));

    expect(navigateMock).toHaveBeenCalledWith('/checkout');
  });
});
