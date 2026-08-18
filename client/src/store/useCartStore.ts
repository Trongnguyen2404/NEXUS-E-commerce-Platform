import { create } from 'zustand';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import type { Cart } from '../types/api';

// Cart store shape: the cart, its item count, the last read failure and the refresh action.
interface CartState {
  cart: Cart | null;
  totalItems: number;
  error: string | null;
  fetchCart: () => Promise<void>;
}

export const useCartStore = create<CartState>((set) => ({
  cart: null,
  totalItems: 0,
  error: null,

  fetchCart: async () => {
    set({ error: null });
    try {
      const cart = await axiosClient.get<Cart>('/cart');
      set({
        cart,
        totalItems: cart.totalItems || 0,
        error: null,
      });
    } catch (error) {
      // A read that failed is not an empty basket. Wiping the cart here made a
      // transient 500 or 429 render as "your cart is empty" and bounced the
      // shopper out of checkout, so keep the last known cart and flag the error.
      console.error('Failed to load the cart:', error);
      set({ error: getErrorMessage(error, 'We could not load your cart.') });
    }
  },
}));
