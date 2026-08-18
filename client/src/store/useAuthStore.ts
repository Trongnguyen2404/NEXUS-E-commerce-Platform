import { create } from 'zustand';
import axiosClient from '../api/axiosClient';
import { useCartStore } from './useCartStore';
import { useWishlistStore } from './useWishlistStore';
import type { AuthResponse } from '../types/api';

// The signed-in user as the auth endpoints return it.
export type AuthUser = AuthResponse['user'];

// Auth store shape: the current user, token and the actions on them.
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => Promise<void>;
}

// Reads the cached user out of localStorage, tolerating bad JSON.
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

  login: (user, accessToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await axiosClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed on server', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });

      // error too, or the previous session's read failure follows the next one in.
      useCartStore.setState({ cart: null, totalItems: 0, error: null });
      useWishlistStore.getState().clear();
    }
  },
}));
