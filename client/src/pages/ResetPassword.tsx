import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';

// Sets a new password from an emailed reset token.
const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('The two passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await axiosClient.post<{ message: string }>('/auth/reset-password', {
        token,
        newPassword: password,
      });

      toast.success('Password reset. Please sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not reset your password.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-state-warning-soft mb-8">
            <ShieldAlert className="text-state-warning" size={28} strokeWidth={2} />
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tight mb-4">Link is incomplete</h1>
          <p className="text-sm font-medium text-gray-500 leading-relaxed mb-10">
            This page needs the token from your reset email. Open the link in that
            email, or request a new one.
          </p>

          <Link
            to="/forgot-password"
            className="inline-block bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-3">
          Choose a new password
        </h1>
        <p className="text-center text-sm text-gray-600 mb-8">
          Signing in on your other devices will be required again afterwards.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
            />
            <p className="mt-3 text-xs font-medium text-gray-400 leading-relaxed">
              At least 8 characters, with an uppercase letter, a lowercase letter,
              a number and a special character.
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Reset password'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="inline-flex items-center space-x-2 text-sm font-semibold text-gray-500 hover:text-black transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
