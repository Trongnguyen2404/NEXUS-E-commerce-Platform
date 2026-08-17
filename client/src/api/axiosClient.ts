import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import type { ApiError } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * The response interceptor below returns `response.data`, so every call already
 * resolves to the payload — but axios's own types still claim `AxiosResponse<T>`.
 * That mismatch is why callers used to write `const res: any = await ...`.
 * Re-declaring the surface here makes the real shape visible to TypeScript.
 */
interface UnwrappedAxios {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
}

/** Requests carry a retry flag so a refreshed call is not refreshed again. */
type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

const instance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Bắt buộc để trình duyệt gửi kèm cookie refresh token (httpOnly) sang API.
  withCredentials: true,
});

// --- CƠ CHẾ KHÓA VÀ HÀNG ĐỢI ---
interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

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

// Interceptor 1: Gắn Token trước khi gửi
instance.interceptors.request.use(
  (config) => {
    // Chỉ lấy từ localStorage cho an toàn và không bị lỗi TypeScript
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor 2: Tự động Refresh Token khi lỗi 401
instance.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config as RetriableRequest | undefined;

    // Nếu lỗi 401, chưa retry và KHÔNG phải là đang gọi API login/refresh
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {

      // NẾU ĐANG CÓ REQUEST KHÁC ĐI REFRESH -> CHO VÀO HÀNG ĐỢI
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

      // ĐÁNH DẤU BẮT ĐẦU REFRESH
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh token đi kèm dưới dạng cookie httpOnly — JS không đọc được nó,
        // chỉ cần bảo trình duyệt gửi cookie theo request.
        const res = await axios.post<{ accessToken: string }>(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );

        const { accessToken } = res.data;

        // Server đã xoay vòng cookie refresh token trong response này
        localStorage.setItem('accessToken', accessToken);

        // Gắn token mới vào request bị lỗi và chạy tiếp
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);

        return instance(originalRequest);

      } catch (refreshError) {
        processQueue(refreshError, null);

        // Ép đăng xuất
        useAuthStore.getState().logout();

        // Chỉ redirect sang /login nếu đang ở trang cần xác thực
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

/**
 * Pulls a displayable string out of whatever the API (or axios) rejected with.
 * class-validator returns `message` as an array of every failed rule; a plain
 * `throw new BadRequestException('...')` returns a single string.
 */
export const getErrorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  const message = (error as ApiError | undefined)?.message;

  if (Array.isArray(message)) return message[0] ?? fallback;
  if (typeof message === 'string' && message.length > 0) return message;

  return fallback;
};

const axiosClient = instance as unknown as UnwrappedAxios;

export default axiosClient;
