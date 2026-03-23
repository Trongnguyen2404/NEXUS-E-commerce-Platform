import { create } from 'zustand';
import axiosClient from '../api/axiosClient';

interface CartState {
  cart: any | null;
  totalItems: number;
  fetchCart: () => Promise<void>;
}

export const useCartStore = create<CartState>((set) => ({
  cart: null,
  totalItems: 0,
  
  // Hàm gọi API lấy giỏ hàng
  fetchCart: async () => {
    try {
      const response: any = await axiosClient.get('/cart');
      set({ 
        cart: response, 
        totalItems: response.totalItems || 0 
      });
    } catch (error) {
      console.error('Lỗi khi tải giỏ hàng:', error);
      set({ cart: null, totalItems: 0 });
    }
  },
}));