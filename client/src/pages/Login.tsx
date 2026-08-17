import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import type { AuthResponse } from '../types/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const fetchCart = useCartStore((state) => state.fetchCart);

  // ProtectedRoute lưu lại trang người dùng định vào, để quay lại đúng chỗ đó.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axiosClient.post<AuthResponse>('/auth/login', { email, password });

      login(response.user, response.accessToken);

      await fetchCart();

      toast.success('Welcome back to NEXUS!');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Invalid email or password'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <h1 className="text-3xl font-black uppercase tracking-tight text-center mb-3">
          Sign in
        </h1>
        <p className="text-center text-sm font-medium text-gray-500 mb-8">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-ink hover:text-black transition-colors">
            Create an account
          </Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[10px] font-bold uppercase tracking-widest text-brand-ink hover:text-black transition-colors"
              >
                Forgot?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;