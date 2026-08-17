import { create } from 'zustand';
import axiosClient from '../api/axiosClient';
import type { Cart } from '../types/api';

interface CartState {
  cart: Cart | null;
  totalItems: number;
  fetchCart: () => Promise<void>;
}

export const useCartStore = create<CartState>((set) => ({
  cart: null,
  totalItems: 0,

  // Hàm gọi API lấy giỏ hàng
  fetchCart: async () => {
    try {
      const cart = await axiosClient.get<Cart>('/cart');
      set({
        cart,
        totalItems: cart.totalItems || 0,
      });
    } catch (error) {
      console.error('Lỗi khi tải giỏ hàng:', error);
      set({ cart: null, totalItems: 0 });
    }
  },
}));
