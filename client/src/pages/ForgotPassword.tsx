import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';

// Requests a password reset link by email.
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await axiosClient.post<{ message: string }>('/auth/forgot-password', { email });

      setIsSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send the reset link. Try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-soft mb-8">
            <MailCheck className="text-brand-ink" size={28} strokeWidth={2} />
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tight mb-4">Check your inbox</h1>
          <p className="text-sm font-medium text-gray-500 leading-relaxed mb-2">
            If an account exists for <strong className="text-black">{email}</strong>, we have sent
            a link to reset your password.
          </p>
          <p className="text-sm font-medium text-gray-500 leading-relaxed mb-10">
            The link expires in 60 minutes and can only be used once.
          </p>

          <Link
            to="/login"
            className="inline-flex items-center space-x-2 text-sm font-semibold text-black hover:text-brand-ink transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-3">
          Forgot your password?
        </h1>
        <p className="text-center text-sm text-gray-600 mb-8">
          Enter the email you signed up with and we will send you a reset link.
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
              className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Send reset link'}
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

export default ForgotPassword;
