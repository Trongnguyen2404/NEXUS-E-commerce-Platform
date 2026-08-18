import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import type { ApiError } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL;

// Axios surface that returns response bodies instead of AxiosResponse objects.
interface UnwrappedAxios {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
}

// A request tagged so a 401 only triggers one refresh attempt.
type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

const instance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },

  withCredentials: true,
});

// A request parked while the access token is being refreshed.
interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

// Releases every parked request once the refresh settles.
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error || !token) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

instance.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config as RetriableRequest | undefined;

    // /auth/logout is on this list because the refresh-failure handler below calls it:
    // without the exclusion its own 401 re-enters the interceptor, starts a second
    // refresh, fails, logs out again and loops until the server starts throttling.
    const skipsRefresh = ['/auth/login', '/auth/refresh', '/auth/logout'].some((path) =>
      originalRequest?.url?.includes(path)
    );

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !skipsRefresh
    ) {
      if (isRefreshing) {
        return new Promise<string>(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return instance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post<{ accessToken: string }>(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );

        const { accessToken } = res.data;

        localStorage.setItem('accessToken', accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);

        return instance(originalRequest);

      } catch (refreshError) {
        processQueue(refreshError, null);

        useAuthStore.getState().logout();

        const protectedPaths = ['/account', '/cart', '/checkout', '/admin'];
        const isProtected = protectedPaths.some((p) =>
          window.location.pathname.startsWith(p)
        );
        if (isProtected) {
          window.location.href = '/login';
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

// Pulls a readable message out of any API or network error.
export const getErrorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  const message = (error as ApiError | undefined)?.message;

  if (Array.isArray(message)) return message[0] ?? fallback;
  if (typeof message === 'string' && message.length > 0) return message;

  return fallback;
};

const axiosClient = instance as unknown as UnwrappedAxios;

export default axiosClient;
