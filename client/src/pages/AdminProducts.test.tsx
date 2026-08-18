import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import AdminProducts from './AdminProducts';
import axiosClient from '../api/axiosClient';
import type { Category, PageResponse, PaginatedResponse, Product, ProductVariant } from '../types/api';

// ---------------------------------------------------------------- mocks

// jsdom withholds storage on an opaque origin here, and the auth store reads
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

const variant = (size: string, price: number, stock: number): ProductVariant => ({
  id: `v-${size.toLowerCase()}`,
  productId: 'p-tee',
  sku: `TEE-${size}`,
  options: { Size: size },
  label: size,
  price,
  stock,
  imageUrl: null,
  isActive: true,
});

const base = (over: Partial<Product>): Product =>
  ({
    description: 'Original copy',
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

// What the API returns for a variant product: price is the CHEAPEST active
// variant (the clearance L at 25) and stock is the sum — neither is the value
// held in the base columns, which are still 40 and 0.
const TEE = base({
  id: 'p-tee',
  name: 'Tee',
  sku: 'TEE',
  price: 25,
  stock: 12,
  hasVariants: true,
  variants: [variant('S', 40, 4), variant('M', 40, 4), variant('L', 25, 4)],
});

const MUG = base({ id: 'p-mug', name: 'Mug', sku: 'MUG', price: 15, stock: 7 });

const categories: Category[] = [
  {
    id: 'c-1',
    name: 'Apparel',
    description: null,
    slug: 'apparel',
    imageUrl: null,
    isActive: true,
    productCount: 2,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  },
];

const live: PaginatedResponse<Product> = {
  data: [TEE, MUG],
  meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
};
const hidden: PaginatedResponse<Product> = {
  data: [],
  meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
};
const categoryPage: PageResponse<Category> = { data: categories, total: 1, page: 1, limit: 20 };

const renderAdmin = () =>
  render(
    <MemoryRouter initialEntries={['/admin/products']}>
      <AdminProducts />
    </MemoryRouter>,
  );

// The Edit pencil is the second action in a row; none of them carry text.
const openEditor = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const row = screen.getByText(name).closest('tr') as HTMLTableRowElement;
  await user.click(within(row).getAllByRole('button')[1]);
  await screen.findByRole('heading', { name: /edit product/i });
};

beforeEach(() => {
  api.get.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/categories') return categoryPage;
    if (url === '/products') return config?.params?.isActive === false ? hidden : live;
    if (url === '/products/p-tee') return TEE;
    if (url === '/products/p-mug') return MUG;
    throw new Error(`unexpected GET ${url}`);
  });
  api.patch.mockResolvedValue({ success: true });
  api.put.mockResolvedValue({ success: true });
  api.post.mockResolvedValue(MUG);
});

// ---------------------------------------------------------------- tests

describe('AdminProducts editing a variant-priced product', () => {
  it('omits price and stock from the update so inheriting variants keep their price', async () => {
    const user = userEvent.setup({ delay: null });
    renderAdmin();
    await screen.findByRole('heading', { name: /inventory/i });

    await openEditor(user, 'Tee');

    // The derived summary is shown but cannot be edited or sent.
    expect(screen.getByLabelText(/price/i)).toBeDisabled();
    expect(screen.getByLabelText(/stock/i)).toBeDisabled();

    // fireEvent keeps this to one re-render of a heavy admin table.
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Fixed typo' } });
    await user.click(screen.getByRole('button', { name: /update product/i }));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [url, payload] = api.patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/products/p-tee');
    expect(payload).toMatchObject({ name: 'Tee', description: 'Fixed typo' });
    expect(payload).not.toHaveProperty('price');
    expect(payload).not.toHaveProperty('stock');
  });

  it('still sends price and stock for a product that has no variants', async () => {
    const user = userEvent.setup({ delay: null });
    renderAdmin();
    await screen.findByRole('heading', { name: /inventory/i });

    await openEditor(user, 'Mug');

    expect(screen.getByLabelText(/price/i)).toBeEnabled();
    await user.clear(screen.getByLabelText(/price/i));
    await user.type(screen.getByLabelText(/price/i), '18.5');
    await user.click(screen.getByRole('button', { name: /update product/i }));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [url, payload] = api.patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/products/p-mug');
    expect(payload).toMatchObject({ price: 18.5, stock: 7 });
  });
});
