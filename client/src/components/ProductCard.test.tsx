import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductCard from './ProductCard';
import { PRODUCT_PLACEHOLDER } from './productPlaceholder';
import { useAuthStore } from '../store/useAuthStore';
import { useWishlistStore } from '../store/useWishlistStore';
import type { Product, ProductVariant } from '../types/api';

// This jsdom build hands us no localStorage, and the auth store reads it while
// the module is still evaluating. Put a working one in place before that import.
vi.hoisted(() => {
  if (globalThis.localStorage) return;

  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
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

// The card pulls in WishlistButton, which talks to the API and to toasts.
vi.mock('../api/axiosClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (_error: unknown, fallback = 'Something went wrong') => fallback,
}));

vi.mock('react-toastify', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Aero Runner',
  description: 'Light and fast.',
  price: 49.99,
  stock: 20,
  hasVariants: false,
  variants: [],
  sku: 'AERO-1',
  imageUrl: 'https://cdn.example.com/aero.jpg',
  images: [],
  category: 'Sneakers',
  categoryId: 'c1',
  isActive: true,
  rating: 0,
  reviewCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeVariant = (): ProductVariant => ({
  id: 'v1',
  productId: 'p1',
  sku: 'AERO-1-RED',
  options: { Color: 'Red' },
  label: 'Red',
  price: 49.99,
  stock: 3,
  imageUrl: null,
  isActive: true,
});

const renderCard = (props: ComponentProps<typeof ProductCard>) =>
  render(
    <MemoryRouter>
      <ProductCard {...props} />
    </MemoryRouter>,
  );

describe('ProductCard', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    useWishlistStore.setState({ products: [], savedIds: new Set(), isLoading: false });
  });

  it('renders the name, the category and the price', () => {
    renderCard({ product: makeProduct() });

    expect(screen.getByRole('heading', { name: 'Aero Runner' })).toBeInTheDocument();
    expect(screen.getByText('Sneakers')).toBeInTheDocument();
    expect(screen.getByText('$49.99')).toBeInTheDocument();
  });

  it('falls back to a house label when the product has no category', () => {
    renderCard({ product: makeProduct({ category: null }) });

    expect(screen.getByText('Nexus')).toBeInTheDocument();
  });

  it('badges New only when the list says the product is new', () => {
    const { unmount } = renderCard({ product: makeProduct() });
    expect(screen.queryByText('New')).not.toBeInTheDocument();
    unmount();

    renderCard({ product: makeProduct(), isNew: true });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('marks a variant-less product with no stock as sold out', () => {
    renderCard({ product: makeProduct({ stock: 0 }), onQuickAdd: vi.fn() });

    expect(screen.getByText('Sold out')).toBeInTheDocument();
    // Nothing to add without a variant to choose.
    expect(screen.queryByRole('button', { name: /quick add/i })).not.toBeInTheDocument();
  });

  it('does not claim sold out when the stock sits on the variants', () => {
    renderCard({
      product: makeProduct({ stock: 0, hasVariants: true, variants: [makeVariant()] }),
    });

    expect(screen.queryByText('Sold out')).not.toBeInTheDocument();
    expect(screen.getByText('Options')).toBeInTheDocument();
  });

  it('warns about low stock at the threshold but not above it', () => {
    const { unmount } = renderCard({ product: makeProduct({ stock: 5 }) });
    expect(screen.getByText('Only 5 left')).toBeInTheDocument();
    unmount();

    const remounted = renderCard({ product: makeProduct({ stock: 6 }) });
    expect(screen.queryByText(/only \d+ left/i)).not.toBeInTheDocument();
    remounted.unmount();

    renderCard({ product: makeProduct({ stock: 1 }) });
    expect(screen.getByText('Only 1 left')).toBeInTheDocument();
  });

  it('hands the product to onQuickAdd when the shopper quick adds', async () => {
    const onQuickAdd = vi.fn();
    const product = makeProduct();
    renderCard({ product, onQuickAdd });

    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));

    expect(onQuickAdd).toHaveBeenCalledTimes(1);
    expect(onQuickAdd).toHaveBeenCalledWith(product);
  });

  it('hides quick add for a product that needs an option chosen first', () => {
    renderCard({
      product: makeProduct({ hasVariants: true, variants: [makeVariant()] }),
      onQuickAdd: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /quick add/i })).not.toBeInTheDocument();
  });

  it('omits quick add entirely when the list passes no handler', () => {
    renderCard({ product: makeProduct() });

    expect(screen.queryByRole('button', { name: /quick add/i })).not.toBeInTheDocument();
  });

  it('links to the product page', () => {
    renderCard({ product: makeProduct({ id: 'abc-123' }) });

    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/abc-123');
  });

  it('shows the product image, and the placeholder when there is none', () => {
    const { unmount } = renderCard({ product: makeProduct() });
    expect(screen.getByRole('img', { name: 'Aero Runner' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/aero.jpg',
    );
    unmount();

    renderCard({ product: makeProduct({ imageUrl: null }) });
    expect(screen.getByRole('img', { name: 'Aero Runner' })).toHaveAttribute(
      'src',
      PRODUCT_PLACEHOLDER,
    );
  });
});
