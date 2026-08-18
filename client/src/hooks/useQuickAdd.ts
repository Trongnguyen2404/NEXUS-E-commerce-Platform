import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import type { Product } from '../types/api';

// Adds one unit straight from a grid tile, for products that have no options.
const useQuickAdd = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const [addingId, setAddingId] = useState<string | null>(null);

  const quickAdd = async (product: Product) => {
    if (!isAuthenticated) {
      toast.info('Sign in to start a bag.');
      navigate('/login');
      return;
    }

    // Anything with options has to be configured on the detail page.
    if (product.hasVariants) {
      navigate(`/products/${product.id}`);
      return;
    }

    setAddingId(product.id);
    try {
      await axiosClient.post('/cart/items', { productId: product.id, quantity: 1 });
      await fetchCart();
      toast.success(`${product.name} added to your bag.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not add that to your bag.'));
    } finally {
      setAddingId(null);
    }
  };

  return { quickAdd, addingId };
};

export default useQuickAdd;
