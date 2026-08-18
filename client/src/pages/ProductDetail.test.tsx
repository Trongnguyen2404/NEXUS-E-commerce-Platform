import { act, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import ProductDetail from './ProductDetail';
import axiosClient from '../api/axiosClient';
import type { PaginatedResponse, PaginatedReviews, Product, ProductVariant } from '../types/api';

// ---------------------------------------------------------------- mocks

// jsdom withholds storage on an opaque origin here, and useAuthStore reads
// localStorage at import time — so it has to exist before the imports run.
vi.hoisted(() => {
  if (globalThis.localStorage) return;
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
      key: (index: number) => [...entries.keys()][index] ?? null,
      get length() {
        return entries.size;
      },
    },
  });
});

const navigateMock = vi.hoisted(() => vi.fn());
// Mutable so a test can move the shopper from one product page to the next
// without remounting — which is exactly what the router does in the app.
const route = vi.hoisted(() => ({ params: { id: 'p-alpha' } as { id: string } }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock, useParams: () => route.params };
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

const api = axiosClient as unknown as Record<'get' | 'post' | 'patch' | 'put' | 'delete', Mock>;

// These pages mount a deep tree; under a fully parallel suite the default 5s
// is not enough headroom on a cold worker.
vi.setConfig({ testTimeout: 20000 });
configure({ asyncUtilTimeout: 10000 });

// ---------------------------------------------------------------- fixtures

const variant = (id: string, size: string, price: number, stock: number): ProductVariant => ({
  id,
  productId: 'p-alpha',
  sku: `ALPHA-${size}`,
  options: { Size: size },
  label: size,
  price,
  stock,
  imageUrl: null,
  isActive: true,
});

const base = (over: Partial<Product>): Product =>
  ({
    description: null,
    hasVariants: false,
    variants: [],
    imageUrl: null,
    images: [],
    category: 'Apparel',
    categoryId: 'c-1',
    isActive: true,
    rating: 0,
    reviewCount: 0,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...over,
  }) as Product;

// The API derives price for a variant product (cheapest active variant), which
// is why ALPHA lists at 25 while its default in-stock option costs 40.
const ALPHA = base({
  id: 'p-alpha',
  name: 'Alpha Tee',
  sku: 'ALPHA',
  price: 25,
  stock: 10,
  hasVariants: true,
  variants: [variant('v-alpha-s', 'S', 40, 5), variant('v-alpha-l', 'L', 25, 5)],
});

const BETA = base({ id: 'p-beta', name: 'Beta Mat', sku: 'BETA', price: 15, stock: 7 });
const GAMMA = base({ id: 'p-gamma', name: 'Gamma Lamp', sku: 'GAMMA', price: 99, stock: 3 });

const catalogue: Record<string, Product> = {
  [ALPHA.id]: ALPHA,
  [BETA.id]: BETA,
  [GAMMA.id]: GAMMA,
};

const listing: PaginatedResponse<Product> = {
  data: [ALPHA, BETA, GAMMA],
  meta: { total: 3, page: 1, limit: 100, totalPages: 1 },
};

const emptyReviews: PaginatedReviews = {
  data: [],
  summary: { average: 0, total: 0, distribution: {} },
  total: 0,
  page: 1,
  limit: 5,
  totalPages: 0,
};

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={[`/products/${route.params.id}`]}>
      <ProductDetail />
    </MemoryRouter>,
  );

// Nothing on the page settles until the detail fetch has painted.
const waitForProduct = (name: RegExp) => screen.findByRole('heading', { level: 1, name });

beforeEach(() => {
  route.params = { id: 'p-alpha' };
  localStorage.setItem('accessToken', 'test-token');
  vi.spyOn(console, 'error').mockImplementation(() => {});

  api.get.mockImplementation(async (url: string) => {
    if (url === '/products') return listing;
    if (url === '/cart') return { id: 'cart-1', cartItems: [], totalItems: 0, totalPrice: 0 };
    if (/^\/products\/[^/]+\/reviews$/.test(url)) return emptyReviews;

    const match = /^\/products\/([^/]+)$/.exec(url);
    if (match) {
      const found = catalogue[match[1]];
      if (!found) throw new Error(`404 ${url}`);
      return found;
    }
    throw new Error(`unexpected GET ${url}`);
  });

  api.post.mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------- tests

describe('ProductDetail per-product state', () => {
  it('drops the previous product variant selection when the product id changes', async () => {
    const { rerender } = renderDetail();
    await waitForProduct(/alpha tee/i);
    // The picker defaults to the first in-stock option, S at $40.
    expect(await screen.findByText('$40.00')).toBeInTheDocument();

    route.params = { id: 'p-beta' };
    rerender(
      <MemoryRouter initialEntries={['/products/p-beta']}>
        <ProductDetail />
      </MemoryRouter>,
    );

    await waitForProduct(/beta mat/i);
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.queryByText('$40.00')).not.toBeInTheDocument();
  });

  it('adds a variant-less product without the previous product variant id', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDetail();
    await waitForProduct(/alpha tee/i);

    route.params = { id: 'p-beta' };
    rerender(
      <MemoryRouter initialEntries={['/products/p-beta']}>
        <ProductDetail />
      </MemoryRouter>,
    );
    await waitForProduct(/beta mat/i);

    await user.click(screen.getByRole('button', { name: /^add to cart$/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/cart/items', {
        productId: 'p-beta',
        quantity: 1,
      }),
    );
  });

  it('shows the not-found screen instead of the previous product when the fetch fails', async () => {
    const { rerender } = renderDetail();
    await waitForProduct(/alpha tee/i);

    route.params = { id: 'p-missing' };
    rerender(
      <MemoryRouter initialEntries={['/products/p-missing']}>
        <ProductDetail />
      </MemoryRouter>,
    );

    await waitForProduct(/product not found/i);
    expect(screen.queryByText(/alpha tee/i)).not.toBeInTheDocument();
  });

  it('ignores a late response for the product the shopper navigated away from', async () => {
    let releaseAlpha: () => void = () => {};
    api.get.mockImplementation(async (url: string) => {
      if (url === '/products') return listing;
      if (url === '/cart') return { id: 'cart-1', cartItems: [], totalItems: 0, totalPrice: 0 };
      if (/^\/products\/[^/]+\/reviews$/.test(url)) return emptyReviews;
      if (url === '/products/p-alpha') {
        return new Promise<Product>((resolve) => {
          releaseAlpha = () => resolve(ALPHA);
        });
      }
      const match = /^\/products\/([^/]+)$/.exec(url);
      if (match && catalogue[match[1]]) return catalogue[match[1]];
      throw new Error(`unexpected GET ${url}`);
    });

    const { rerender } = renderDetail();

    route.params = { id: 'p-beta' };
    rerender(
      <MemoryRouter initialEntries={['/products/p-beta']}>
        <ProductDetail />
      </MemoryRouter>,
    );
    await waitForProduct(/beta mat/i);

    await act(async () => {
      releaseAlpha();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await waitForProduct(/beta mat/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /alpha tee/i })).not.toBeInTheDocument();
  });
});
