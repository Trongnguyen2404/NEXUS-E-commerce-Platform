import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import axiosClient from '../api/axiosClient';
import { useWishlistStore } from './useWishlistStore';
import type { Product } from '../types/api';

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

// This jsdom build ships without Web Storage, and the store gates on the stored token.
const memoryStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => (entries.has(key) ? (entries.get(key) as string) : null),
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  };
};
vi.stubGlobal('localStorage', memoryStorage());

const mockGet = axiosClient.get as unknown as Mock;
const mockPost = axiosClient.post as unknown as Mock;

const product = (id: string): Product => ({ id, name: 'Product ' + id }) as Product;

const signIn = () => localStorage.setItem('accessToken', 'token-123');

beforeEach(() => {
  // Zustand stores are real singletons; hand each test an empty one.
  useWishlistStore.setState({ products: [], savedIds: new Set(), isLoading: false });
  localStorage.clear();
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('useWishlistStore.fetchWishlist', () => {
  it('does not call the API when nobody is signed in', async () => {
    await useWishlistStore.getState().fetchWishlist();

    expect(mockGet).not.toHaveBeenCalled();
    expect(useWishlistStore.getState().products).toEqual([]);
    expect(useWishlistStore.getState().isLoading).toBe(false);
  });

  it('stores the saved products and their ids', async () => {
    signIn();
    mockGet.mockResolvedValue({ data: [product('p1'), product('p2')], total: 2 });

    await useWishlistStore.getState().fetchWishlist();

    expect(mockGet).toHaveBeenCalledWith('/wishlist');
    expect(useWishlistStore.getState().products.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect([...useWishlistStore.getState().savedIds]).toEqual(['p1', 'p2']);
    expect(useWishlistStore.getState().isLoading).toBe(false);
  });

  it('stops loading even when the request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    signIn();
    mockGet.mockRejectedValue({ statusCode: 500, message: 'Server error' });

    await expect(useWishlistStore.getState().fetchWishlist()).resolves.toBeUndefined();

    expect(useWishlistStore.getState().isLoading).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('useWishlistStore.toggle', () => {
  it('marks a product saved once the API confirms it', async () => {
    useWishlistStore.setState({ products: [product('p1')], savedIds: new Set(['p1']) });
    mockPost.mockResolvedValue({ message: 'Added', inWishlist: true });

    const nowSaved = await useWishlistStore.getState().toggle('p2');

    expect(mockPost).toHaveBeenCalledWith('/wishlist/p2/toggle');
    expect(nowSaved).toBe(true);
    expect([...useWishlistStore.getState().savedIds]).toEqual(['p1', 'p2']);
    // The saved list itself only grows on the next fetch.
    expect(useWishlistStore.getState().products.map((p) => p.id)).toEqual(['p1']);
  });

  it('drops the product from the saved ids and the list when it is unsaved', async () => {
    useWishlistStore.setState({
      products: [product('p1'), product('p2')],
      savedIds: new Set(['p1', 'p2']),
    });
    mockPost.mockResolvedValue({ message: 'Removed', inWishlist: false });

    const nowSaved = await useWishlistStore.getState().toggle('p1');

    expect(nowSaved).toBe(false);
    expect([...useWishlistStore.getState().savedIds]).toEqual(['p2']);
    expect(useWishlistStore.getState().products.map((p) => p.id)).toEqual(['p2']);
  });

  it('leaves the saved ids untouched when the API rejects the toggle', async () => {
    const before = new Set(['p1']);
    useWishlistStore.setState({ products: [product('p1')], savedIds: before });
    mockPost.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });

    await expect(useWishlistStore.getState().toggle('p2')).rejects.toEqual({
      statusCode: 401,
      message: 'Unauthorized',
    });

    // No phantom heart: the failed product never entered the set.
    expect([...useWishlistStore.getState().savedIds]).toEqual(['p1']);
    expect(useWishlistStore.getState().savedIds).toBe(before);
    expect(useWishlistStore.getState().products.map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps a saved product saved when unsaving it fails', async () => {
    useWishlistStore.setState({ products: [product('p1')], savedIds: new Set(['p1']) });
    mockPost.mockRejectedValue({ statusCode: 500, message: 'Server error' });

    await expect(useWishlistStore.getState().toggle('p1')).rejects.toBeDefined();

    expect([...useWishlistStore.getState().savedIds]).toEqual(['p1']);
    expect(useWishlistStore.getState().products.map((p) => p.id)).toEqual(['p1']);
  });

  it('swaps in a new Set so subscribed components re-render', async () => {
    const before = new Set(['p1']);
    useWishlistStore.setState({ products: [product('p1')], savedIds: before });
    mockPost.mockResolvedValue({ message: 'Added', inWishlist: true });

    await useWishlistStore.getState().toggle('p2');

    expect(useWishlistStore.getState().savedIds).not.toBe(before);
    expect([...before]).toEqual(['p1']);
  });
});

describe('useWishlistStore.clear', () => {
  it('empties the wishlist on sign out', () => {
    useWishlistStore.setState({ products: [product('p1')], savedIds: new Set(['p1']) });

    useWishlistStore.getState().clear();

    expect(useWishlistStore.getState().products).toEqual([]);
    expect(useWishlistStore.getState().savedIds.size).toBe(0);
  });
});
