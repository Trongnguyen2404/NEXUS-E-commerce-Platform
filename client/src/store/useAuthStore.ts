import { create } from 'zustand';
import axiosClient from '../api/axiosClient';
import { useCartStore } from './useCartStore';
import { useWishlistStore } from './useWishlistStore';
import type { AuthResponse } from '../types/api';

/** The subset of the user the API returns on login/register. */
export type AuthUser = AuthResponse['user'];

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => Promise<void>;
}

/** localStorage holds a string; anything could be in there, so parse defensively. */
const readStoredUser = (): AuthUser | null => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') as AuthUser | null;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  user: readStoredUser(),
  isAuthenticated: !!localStorage.getItem('accessToken'),

  // Chỉ access token (sống 15 phút) nằm ở localStorage. Refresh token do server
  // set bằng cookie httpOnly nên JavaScript không đọc được.
  login: (user, accessToken) => {
    localStorage.setItem('accessToken', accessToken);
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
      // Xóa mọi thứ ở Frontend (cookie refresh token do server tự xóa)
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });

      // Xóa luôn số lượng giỏ hàng và wishlist trên Navbar
      useCartStore.setState({ cart: null, totalItems: 0 });
      useWishlistStore.getState().clear();
    }
  },
}));
