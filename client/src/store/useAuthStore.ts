import { create } from 'zustand';
import axiosClient from '../api/axiosClient';
import { useCartStore } from './useCartStore';

interface AuthState {
  user: any | null;
  isAuthenticated: boolean;
  login: (user: any, accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isAuthenticated: !!localStorage.getItem('accessToken'),

  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken); // Lưu thêm Refresh Token
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      // Gọi API báo cho Backend xóa Refresh Token trong DB
      await axiosClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed on server', error);
    } finally {
      // Xóa mọi thứ ở Frontend
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });
      
      // Xóa luôn số lượng giỏ hàng trên Navbar
      useCartStore.setState({ cart: null, totalItems: 0 }); 
    }
  },
}));