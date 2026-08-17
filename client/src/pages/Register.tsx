import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useAuthStore } from '../store/useAuthStore';
import type { AuthResponse } from '../types/api';

const Register = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Gọi API POST /auth/register
      const response = await axiosClient.post<AuthResponse>('/auth/register', {
        firstName,
        lastName,
        email,
        password,
      });

      // Đăng nhập luôn ngay sau khi đăng ký thành công
      login(response.user, response.accessToken);

      toast.success('Account created successfully!');
      navigate('/');
    } catch (error) {
      // getErrorMessage bóc cả mảng lỗi của ValidationPipe lẫn message đơn của
      // ConflictException ("User with this email already exists").
      toast.error(getErrorMessage(error, 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-md w-full">
        <h1 className="text-3xl font-black uppercase tracking-tight text-center mb-3">
          Join Nexus
        </h1>
        <p className="text-center text-sm font-medium text-gray-500 mb-8">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-ink hover:text-black transition-colors">
            Sign in
          </Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
              />
            </div>
          </div>

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
            <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
            />
            <p className="mt-3 text-xs font-medium text-gray-400 leading-relaxed">
              At least 8 characters, with an uppercase letter, a lowercase letter,
              a number and a special character.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Register;