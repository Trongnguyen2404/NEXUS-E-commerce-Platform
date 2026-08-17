import { create } from 'zustand';
import axiosClient from '../api/axiosClient';
import type { Product, WishlistToggleResponse } from '../types/api';

interface WishlistState {
  products: Product[];
  /** Product ids, for O(1) lookups from heart buttons in a grid. */
  savedIds: Set<string>;
  isLoading: boolean;
  fetchWishlist: () => Promise<void>;
  toggle: (productId: string) => Promise<boolean>;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  products: [],
  savedIds: new Set(),
  isLoading: false,

  fetchWishlist: async () => {
    // Anonymous visitors would just get a 401 and a red toast.
    if (!localStorage.getItem('accessToken')) return;

    set({ isLoading: true });
    try {
      const res = await axiosClient.get<{ data: Product[]; total: number }>('/wishlist');
      set({
        products: res.data,
        savedIds: new Set(res.data.map((product) => product.id)),
      });
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Flips one product and returns its new state.
   *
   * Updates the local set from the server's answer rather than assuming — the
   * endpoint is idempotent, so a double click cannot desync the heart.
   */
  toggle: async (productId) => {
    const res = await axiosClient.post<WishlistToggleResponse>(
      `/wishlist/${productId}/toggle`,
    );

    const savedIds = new Set(get().savedIds);
    if (res.inWishlist) {
      savedIds.add(productId);
    } else {
      savedIds.delete(productId);
    }

    set({
      savedIds,
      // Drop it from the visible list immediately so the wishlist page does not
      // keep showing a card the user just un-hearted.
      products: res.inWishlist
        ? get().products
        : get().products.filter((product) => product.id !== productId),
    });

    return res.inWishlist;
  },

  clear: () => set({ products: [], savedIds: new Set() }),
}));
