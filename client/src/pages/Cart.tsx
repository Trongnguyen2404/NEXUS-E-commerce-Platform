import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ArrowRight, ShoppingBag, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';
import type { Quote } from '../types/api';

// Cart page with quantity controls and the order summary.
const Cart = () => {
  const navigate = useNavigate();
  const { cart, error: cartError, fetchCart } = useCartStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    await fetchCart();
    setIsLoading(false);
  }, [fetchCart]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // Ask the server what this basket costs so the free-shipping bar uses the
  // real threshold instead of a number copied into the client.
  useEffect(() => {
    const items = cart?.cartItems ?? [];
    if (items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    let cancelled = false;

    axiosClient
      .post<Quote>('/orders/quote', {
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          ...(item.variantId ? { variantId: item.variantId } : {}),
        })),
      })
      .then((next) => {
        if (cancelled) return;
        setQuote(next);
        setQuoteError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        // The quote rejects with the real reason a basket cannot be ordered —
        // a line out of stock, a product deactivated — so show it instead of
        // discarding it and letting the summary fall through to "Free".
        console.error('Failed to price the cart:', error);
        setQuote(null);
        setQuoteError(getErrorMessage(error, 'We could not price your cart right now.'));
      });

    return () => {
      cancelled = true;
    };
  }, [cart]);

  const amountToFreeShipping = quote?.amountToFreeShipping ?? 0;
  const freeShippingProgress =
    quote && quote.subtotal + amountToFreeShipping > 0
      ? Math.min(100, (quote.subtotal / (quote.subtotal + amountToFreeShipping)) * 100)
      : 100;

  const updateQuantity = async (cartItemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setIsUpdating(true);
    try {
      await axiosClient.patch(`/cart/items/${cartItemId}`, { quantity: newQuantity });
      await fetchCart();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Insufficient stock.'));
    } finally {
      setIsUpdating(false);
    }
  };

  const removeItem = async (cartItemId: string) => {
    setIsUpdating(true);
    try {
      await axiosClient.delete(`/cart/items/${cartItemId}`);
      await fetchCart();
      toast.success('Item removed from cart.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Error removing item.'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  // A cart we failed to read is not a cart the shopper emptied; offer a retry
  // rather than the "you have not added anything yet" screen.
  if (cartError && !cart?.cartItems?.length) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-50 rounded-full mb-8">
          <AlertCircle size={40} className="text-state-danger" />
        </div>
        <h2 className="text-4xl font-black uppercase tracking-tight mb-4">We Couldn't Load Your Cart</h2>
        <p className="text-gray-500 mb-10 font-medium">{cartError}</p>
        <button
          onClick={loadCart}
          className="inline-flex items-center space-x-2 bg-black text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-gray-800 transition-colors"
        >
          <RefreshCw size={18} />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  if (!cart || !cart.cartItems || cart.cartItems.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-50 rounded-full mb-8">
          <ShoppingBag size={40} className="text-gray-300" />
        </div>
        <h2 className="text-4xl font-black uppercase tracking-tight mb-4">Your Cart is Empty</h2>
        <p className="text-gray-500 mb-10 font-medium">Looks like you haven't added any gear to your setup yet.</p>
        <Link
          to="/products"
          className="inline-flex items-center space-x-2 bg-black text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-gray-800 transition-colors"
        >
          <span>Continue Shopping</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white">
      <h1 className="text-4xl font-black uppercase tracking-tight mb-12">Review Your Gear</h1>

      {cartError && (
        <div role="alert" className="mb-8 flex items-center gap-3 rounded-2xl border border-gray-200 bg-[#F8F9FA] px-5 py-4">
          <AlertCircle size={18} className="text-state-danger shrink-0" />
          <p className="text-sm font-semibold text-gray-700">
            {cartError} Showing the last cart we loaded.
          </p>
          <button
            onClick={loadCart}
            className="ml-auto text-xs font-black uppercase tracking-widest text-black hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-12 items-start">
        <div className="flex-1 w-full space-y-6">
          {cart.cartItems.map((item) => (
            <div key={item.id} className={`flex gap-6 bg-white border border-gray-200 p-6 rounded-2xl ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="w-32 h-32 bg-[#F3F4F6] rounded-xl p-4 flex items-center justify-center shrink-0">
                <img
                  src={item.product.imageUrl || PRODUCT_PLACEHOLDER}
                  onError={(e) => { e.currentTarget.src = PRODUCT_PLACEHOLDER; }}
                  alt={item.product.name}
                  className="max-h-full object-contain"
                />
              </div>

              <div className="flex-1 flex flex-col justify-between py-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-black uppercase leading-tight mb-1">{item.product.name}</h3>
                    {item.variantLabel ? (
                      <p className="text-xs font-bold text-black uppercase tracking-widest">{item.variantLabel}</p>
                    ) : (
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{item.product.category}</p>
                    )}
                  </div>
                  <p className="text-xl font-black">${Number(item.unitPrice).toFixed(2)}</p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center border border-gray-200 rounded-lg">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1.5 text-gray-500 hover:text-black font-bold">-</button>
                    <span className="px-3 font-bold text-sm w-8 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1.5 text-gray-500 hover:text-black font-bold">+</button>
                  </div>

                  <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-state-danger transition-colors flex items-center space-x-1">
                    <Trash2 size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="w-full lg:w-[400px] bg-[#F8F9FA] border border-gray-200 rounded-3xl p-8 sticky top-28">
          <h2 className="text-xl font-black uppercase mb-6">Order Summary</h2>

          <div className="space-y-4 text-sm font-medium border-b border-gray-200 pb-6 mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal ({cart.totalItems} items)</span>
              <span className="font-bold">${Number(cart.totalPrice).toFixed(2)}</span>
            </div>
            {/* "Free" is only true once the server has priced the basket. A missing
                quote — first paint, or a rejected one — means the fee is unknown, and
                calling that Free promised a discount checkout then charged for. */}
            <div className="flex justify-between">
              <span className="text-gray-500">Shipping</span>
              {quote && quote.shippingFee === 0 ? (
                <span className="font-bold text-state-success">Free</span>
              ) : (
                <span className="font-bold text-gray-400">At checkout</span>
              )}
            </div>
            {/* Tax depends on the shipping address, which is only picked at
                checkout — quoting $0.00 here made the total look wrong later. */}
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span className="font-bold text-gray-400">At checkout</span>
            </div>
          </div>

          {quoteError && (
            <div role="alert" className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-state-danger">{quoteError}</p>
            </div>
          )}

          {quote && amountToFreeShipping > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-600 mb-2.5">
                Spend <span className="text-black font-black">${amountToFreeShipping.toFixed(2)}</span>{' '}
                more for free shipping.
              </p>
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-500"
                  style={{ width: `${freeShippingProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between items-end mb-8">
            <span className="text-base font-bold uppercase text-gray-500">Subtotal</span>
            <span className="text-4xl font-black leading-none">${Number(cart.totalPrice).toFixed(2)}</span>
          </div>

          <button
            onClick={() => navigate('/checkout')}
            className="w-full bg-brand text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-brand-ink transition-all shadow-lg shadow-brand/30 flex items-center justify-center space-x-2"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
