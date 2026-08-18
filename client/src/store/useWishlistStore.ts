import { create } from 'zustand';
import axiosClient from '../api/axiosClient';
import type { Product, WishlistToggleResponse } from '../types/api';

// Wishlist store shape: the saved ids and the actions on them.
interface WishlistState {
  products: Product[];

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

      products: res.inWishlist
        ? get().products
        : get().products.filter((product) => product.id !== productId),
    });

    return res.inWishlist;
  },

  clear: () => set({ products: [], savedIds: new Set() }),
}));
