import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { toast } from 'react-toastify';
import { getErrorMessage } from '../api/axiosClient';
import { useAuthStore } from '../store/useAuthStore';
import { useWishlistStore } from '../store/useWishlistStore';

interface Props {
  productId: string;
  size?: number;
  /** `icon` is the floating circle on a product card; `full` is a labelled button. */
  variant?: 'icon' | 'full';
  className?: string;
}

const WishlistButton = ({ productId, size = 18, variant = 'icon', className = '' }: Props) => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const savedIds = useWishlistStore((state) => state.savedIds);
  const toggle = useWishlistStore((state) => state.toggle);

  const [isBusy, setIsBusy] = useState(false);
  const isSaved = savedIds.has(productId);

  const handleClick = async (e: React.MouseEvent) => {
    // These sit inside clickable product cards — without this the click would
    // also navigate to the product page.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.info('Sign in to save products.');
      navigate('/login');
      return;
    }

    setIsBusy(true);
    try {
      const nowSaved = await toggle(productId);
      toast.success(nowSaved ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update your wishlist.'));
    } finally {
      setIsBusy(false);
    }
  };

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        aria-pressed={isSaved}
        className={`flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 ${
          isSaved
            ? 'bg-red-50 text-red-500 hover:bg-red-100'
            : 'bg-[#F5F5F7] text-black hover:bg-gray-200'
        } ${className}`}
      >
        <Heart size={size} fill={isSaved ? 'currentColor' : 'none'} strokeWidth={2} />
        <span>{isSaved ? 'Saved' : 'Save for later'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      aria-pressed={isSaved}
      aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
      className={`h-10 w-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm transition-all hover:scale-110 disabled:opacity-50 ${className}`}
    >
      <Heart
        size={size}
        className={isSaved ? 'text-red-500' : 'text-gray-400'}
        fill={isSaved ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
    </button>
  );
};

export default WishlistButton;
