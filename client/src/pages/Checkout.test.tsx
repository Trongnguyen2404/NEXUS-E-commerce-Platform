import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import Checkout from './Checkout';
import axiosClient from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';
import type { Address, Cart, CartItem, Order, Product, Quote } from '../types/api';

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
  getErrorMessage: (_error: unknown, fallback = 'Something went wrong') => fallback,
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), warning: vi.fn() },
}));

// Stripe would fetch js.stripe.com and mount a cross-origin iframe; stand in for it.
const stripe = vi.hoisted(() => ({ confirmPayment: vi.fn() }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div>Card details</div>,
  useStripe: () => ({ confirmPayment: stripe.confirmPayment }),
  useElements: () => ({}),
}));

const api = axiosClient as unknown as Record<'get' | 'post' | 'patch' | 'put' | 'delete', Mock>;

// ---------------------------------------------------------------- fixtures

const product = (id: string, name: string): Product =>
  ({ id, name, imageUrl: null, category: 'Keyboards' }) as Product;

// A variant line and a plain line, so the payload has to tell them apart.
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

const makeCart = (items: CartItem[] = [VARIANT_LINE, PLAIN_LINE]): Cart => ({
  id: 'cart-1',
  userId: 'user-1',
  cartItems: items,
  totalItems: items.reduce((n, i) => n + i.quantity, 0),
  totalPrice: items.reduce((n, i) => n + Number(i.unitPrice) * i.quantity, 0),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// What the basket MUST look like on the wire: the variant line keeps variantId,
// the plain line carries no variantId key at all.
const EXPECTED_BASKET = [
  { productId: 'p-keyboard', quantity: 2, variantId: 'v-blue-switch' },
  { productId: 'p-desk-mat', quantity: 1 },
];

// Server prices deliberately disagree with a naive client sum (2*100 + 60 = 260),
// so any client-side recomputation shows up as a failure.
const BASE_QUOTE: Quote = {
  items: [],
  subtotal: 175.5,
  discountAmount: 0,
  coupon: null,
  shippingFee: 12.5,
  freeShippingThreshold: 300,
  amountToFreeShipping: 124.5,
  taxRate: 0.08,
  taxAmount: 14.04,
  total: 202.04,
};

const DISCOUNTED_QUOTE: Quote = {
  ...BASE_QUOTE,
  discountAmount: 17.55,
  coupon: {
    id: 'coupon-1',
    code: 'SAVE10',
    type: 'PERCENT',
    value: 10,
    discountAmount: 17.55,
  },
  taxAmount: 12.64,
  total: 183.09,
};

const ADDRESS: Address = {
  id: 'addr-1',
  fullName: 'Trong Nguyen',
  phone: '0900000000',
  line1: '12 Nguyen Hue',
  line2: null,
  city: 'Ho Chi Minh',
  state: null,
  postalCode: '70000',
  country: 'VN',
  isDefault: true,
  formatted: '12 Nguyen Hue, Ho Chi Minh',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CREATED_ORDER = {
  id: 'order-99',
  subtotal: 175.5,
  discountAmount: 0,
  shippingFee: 12.5,
  taxAmount: 14.04,
  total: 202.04,
} as Order;

// Same order, re-priced by the server between the quote and the POST /orders.
const REPRICED_ORDER = {
  id: 'order-99',
  subtotal: 210,
  discountAmount: 0,
  shippingFee: 12.5,
  taxAmount: 17.8,
  total: 240.3,
} as Order;

interface QuoteBody {
  items: unknown[];
  couponCode?: string;
}

let addresses: Address[];
let cartFromServer: Cart;
let orderFromServer: Order;

const postCalls = (url: string) => api.post.mock.calls.filter((call) => call[0] === url);
const quoteCalls = () => postCalls('/orders/quote') as [string, QuoteBody][];

const renderCheckout = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <Checkout />
    </MemoryRouter>,
  );

beforeEach(() => {
  addresses = [ADDRESS];
  cartFromServer = makeCart();
  orderFromServer = CREATED_ORDER;

  useCartStore.setState({ cart: cartFromServer, totalItems: cartFromServer.totalItems });

  api.get.mockImplementation(async (url: string) => {
    if (url === '/addresses') return addresses;
    if (url === '/cart') return cartFromServer;
    throw new Error(`unexpected GET ${url}`);
  });

  api.post.mockImplementation(async (url: string, body?: unknown) => {
    if (url === '/orders/quote') {
      return (body as QuoteBody)?.couponCode ? DISCOUNTED_QUOTE : BASE_QUOTE;
    }
    if (url === '/orders') return { success: true, data: orderFromServer, message: 'created' };
    if (url === '/payments/create-intent') {
      return {
        success: true,
        data: { clientSecret: 'cs_test_123', paymentId: 'pay-1' },
        message: 'ok',
      };
    }
    if (url === '/payments/confirm') return { success: true, data: null, message: 'ok' };
    throw new Error(`unexpected POST ${url}`);
  });

  stripe.confirmPayment.mockResolvedValue({
    paymentIntent: { id: 'pi_123', status: 'succeeded' },
  });
});

// Walks the shipping step: waits for the address book, then places the order.
const proceedToPayment = async (user: ReturnType<typeof userEvent.setup>) => {
  const button = await screen.findByRole('button', { name: /continue to payment/i });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  return screen.findByRole('button', { name: /pay now/i });
};

// ---------------------------------------------------------------- tests

describe('Checkout basket payload', () => {
  it('sends variantId with the variant line when pricing the basket', async () => {
    renderCheckout();

    await waitFor(() => expect(quoteCalls().length).toBeGreaterThan(0));

    expect(api.post).toHaveBeenCalledWith('/orders/quote', { items: EXPECTED_BASKET });
  });

  it('sends variantId with the variant line when creating the order', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await proceedToPayment(user);

    expect(api.post).toHaveBeenCalledWith('/orders', {
      items: EXPECTED_BASKET,
      addressId: 'addr-1',
    });
  });

  it('keeps variantId on the basket after a promo code is applied', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.type(await screen.findByLabelText(/promo code/i), 'SAVE10');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => expect(screen.getByText('$183.09')).toBeInTheDocument());

    expect(api.post).toHaveBeenCalledWith('/orders/quote', {
      items: EXPECTED_BASKET,
      couponCode: 'SAVE10',
    });
  });
});

describe('Checkout totals', () => {
  it('renders the figures the server quoted rather than recomputing them', async () => {
    renderCheckout();

    // Subtotal, shipping, tax and total all come straight off the quote.
    expect(await screen.findByText('$175.50')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(screen.getByText('Tax (8%)')).toBeInTheDocument();
    expect(screen.getByText('$14.04')).toBeInTheDocument();
    expect(screen.getByText('$202.04')).toBeInTheDocument();

    // A client-side sum of the lines would read $260.00 - it must appear nowhere.
    expect(screen.queryByText('$260.00')).not.toBeInTheDocument();
  });

  it('never shows a $0.00 total once the quote has arrived', async () => {
    renderCheckout();

    await waitFor(() => expect(screen.getByText('$202.04')).toBeInTheDocument());
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('surfaces the free-shipping shortfall from the quote', async () => {
    renderCheckout();

    expect(await screen.findByText('Spend $124.50 more for free shipping.')).toBeInTheDocument();
  });
});

describe('Checkout promo code', () => {
  it('applies a code and re-prices the basket from the server', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await waitFor(() => expect(screen.getByText('$202.04')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/promo code/i), 'SAVE10');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect(await screen.findByText('SAVE10')).toBeInTheDocument();
    expect(screen.getByText('−$17.55')).toBeInTheDocument();
    expect(screen.getByText('$183.09')).toBeInTheDocument();
    expect(quoteCalls().at(-1)?.[1]).toEqual({ items: EXPECTED_BASKET, couponCode: 'SAVE10' });
  });

  it('removes the code and re-prices without it', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.type(await screen.findByLabelText(/promo code/i), 'SAVE10');
    await user.click(screen.getByRole('button', { name: /apply/i }));
    await screen.findByRole('button', { name: /remove/i });

    await user.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.getByText('$202.04')).toBeInTheDocument());
    expect(screen.queryByText('−$17.55')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/promo code/i)).toBeInTheDocument();
    expect(quoteCalls().at(-1)?.[1]).toEqual({ items: EXPECTED_BASKET });
  });
});

describe('Checkout address gate', () => {
  it('disables Continue to Payment until an address is available', async () => {
    addresses = [];
    const user = userEvent.setup();
    renderCheckout();

    const button = await screen.findByRole('button', { name: /continue to payment/i });
    await waitFor(() => expect(screen.getByText(/no saved addresses yet/i)).toBeInTheDocument());

    expect(button).toBeDisabled();
    expect(screen.getByText(/add or choose an address to continue/i)).toBeInTheDocument();

    await user.click(button);
    expect(api.post).not.toHaveBeenCalledWith('/orders', expect.anything());
  });

  it('enables Continue to Payment once an address is selected', async () => {
    renderCheckout();

    const button = await screen.findByRole('button', { name: /continue to payment/i });
    await waitFor(() => expect(button).toBeEnabled());
    expect(await screen.findByText(/^selected$/i)).toBeInTheDocument();
  });
});

describe('Checkout empty-cart guard', () => {
  it('sends the buyer back to /cart when there is nothing to check out', async () => {
    cartFromServer = makeCart([]);
    useCartStore.setState({ cart: null, totalItems: 0 });

    renderCheckout();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/cart'));
  });

  it('does NOT bounce the buyer to /cart after the order has been created', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await proceedToPayment(user);
    navigateMock.mockClear();

    // Placing the order checks the cart out, so it legitimately empties.
    const emptied = makeCart([]);
    cartFromServer = emptied;
    await act(async () => {
      useCartStore.setState({ cart: emptied, totalItems: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(navigateMock).not.toHaveBeenCalledWith('/cart');
    expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
  });

  it('keeps the buyer on the payment step through the Stripe confirmation', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await proceedToPayment(user);

    const emptied = makeCart([]);
    cartFromServer = emptied;
    await act(async () => {
      useCartStore.setState({ cart: emptied, totalItems: 0 });
    });

    await user.click(screen.getByRole('button', { name: /pay now/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/payments/confirm', {
        paymentIntentId: 'pi_123',
        orderId: 'order-99',
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/account');
    expect(navigateMock).not.toHaveBeenCalledWith('/cart');
  });
});

describe('Checkout order creation on retry', () => {
  it('reuses the created order instead of placing a second one when create-intent fails', async () => {
    const base = api.post.getMockImplementation()!;
    let intentAttempts = 0;
    api.post.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/payments/create-intent') {
        intentAttempts += 1;
        if (intentAttempts === 1) throw new Error('stripe unavailable');
      }
      return base(url, body);
    });

    const user = userEvent.setup();
    renderCheckout();

    const button = await screen.findByRole('button', { name: /continue to payment/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    // First attempt failed, so the buyer is still on the shipping step.
    await waitFor(() => expect(intentAttempts).toBe(1));
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    await screen.findByRole('button', { name: /pay now/i });

    // The order was placed once; only the intent was retried, against that order.
    expect(postCalls('/orders')).toHaveLength(1);
    expect(postCalls('/payments/create-intent')).toEqual([
      ['/payments/create-intent', { orderId: 'order-99' }],
      ['/payments/create-intent', { orderId: 'order-99' }],
    ]);
  });
});

describe('Checkout re-priced order', () => {
  beforeEach(() => {
    orderFromServer = REPRICED_ORDER;
  });

  it('shows the re-priced order total rather than the stale quote', async () => {
    const user = userEvent.setup();
    renderCheckout();

    const button = await screen.findByRole('button', { name: /continue to payment/i });
    await waitFor(() => expect(button).toBeEnabled());
    await waitFor(() => expect(screen.getByText('$202.04')).toBeInTheDocument());
    await user.click(button);

    // Every figure in the summary now comes from the order Stripe will charge.
    expect(await screen.findByText('$240.30')).toBeInTheDocument();
    expect(screen.getByText('$210.00')).toBeInTheDocument();
    expect(screen.getByText('$17.80')).toBeInTheDocument();
    expect(screen.queryByText('$202.04')).not.toBeInTheDocument();
    expect(screen.queryByText('$175.50')).not.toBeInTheDocument();
    expect(screen.queryByText('$14.04')).not.toBeInTheDocument();
  });

  it('does not open the card form until the buyer confirms the new total', async () => {
    const user = userEvent.setup();
    renderCheckout();

    const button = await screen.findByRole('button', { name: /continue to payment/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    // The price change is surfaced and payment is held back.
    expect(await screen.findByRole('alert')).toHaveTextContent(/\$240\.30/);
    expect(postCalls('/payments/create-intent')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm new total/i }));
    await screen.findByRole('button', { name: /pay now/i });

    expect(postCalls('/orders')).toHaveLength(1);
    expect(postCalls('/payments/create-intent')).toEqual([
      ['/payments/create-intent', { orderId: 'order-99' }],
    ]);
  });
});
