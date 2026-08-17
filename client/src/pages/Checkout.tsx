import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Loader2, CreditCard, Tag } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';
import AddressBook from '../components/AddressBook';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';
import type { Address, ApiEnvelope, Order, Quote } from '../types/api';

// Stripe Imports
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// ==========================================
// ⚠️ Replace with your actual Stripe Public Key
// ==========================================
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
// ------------------------------------------------------------------
// COMPONENT 1: The Stripe Payment Form (Rendered in Step 2)
// ------------------------------------------------------------------
const PaymentForm = ({ orderId }: { orderId: string }) => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { fetchCart } = useCartStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    try {
      // 1. Confirm payment with Stripe directly
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required', // Prevents automatic redirect so we can handle our backend
      });

      if (error) {
        toast.error(error.message || 'Payment failed.');
        setIsProcessing(false);
        return;
      }

      // 2. If Stripe says it succeeded, tell our Backend to confirm it
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        await axiosClient.post('/payments/confirm', {
          paymentIntentId: paymentIntent.id,
          orderId: orderId,
        });

        await fetchCart();

        toast.success('Payment successful! Order completed.');
        navigate('/account');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Error confirming payment on server.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handlePaymentSubmit} className="space-y-6 mt-6">
      <div className="bg-[#F5F5F7] p-4 rounded-xl">
        {/* Stripe's secure pre-built UI element */}
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-brand text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-brand-ink transition-all shadow-xl shadow-brand/20 flex items-center justify-center disabled:opacity-50"
      >
        {isProcessing ? <Loader2 className="animate-spin" /> : 'Pay Now'}
      </button>
    </form>
  );
};


// ------------------------------------------------------------------
// COMPONENT 2: Main Checkout Page
// ------------------------------------------------------------------
const Checkout = () => {
  const navigate = useNavigate();
  const { cart, fetchCart } = useCartStore();

  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Promo code: what is typed, and what the server has actually accepted.
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Every figure shown comes from the server. Nothing is added up in the browser.
  const [quote, setQuote] = useState<Quote | null>(null);

  // State for Step 2 (Payment)
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  // ProtectedRoute đã chặn người chưa đăng nhập, ở đây chỉ lo giỏ hàng rỗng.
  useEffect(() => {
    if (!cart || cart.cartItems.length === 0) {
      fetchCart().then(() => {
        if (!useCartStore.getState().cart?.cartItems?.length) navigate('/cart');
      });
    }
  }, [cart, navigate, fetchCart]);

  const basketItems = useMemo(
    () =>
      cart?.cartItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      })) ?? [],
    [cart],
  );

  /** Re-prices the basket server-side. `code` is passed explicitly so applying
   *  and clearing a promo code can both quote before state has settled. */
  const refreshQuote = useCallback(
    async (code: string | null) => {
      if (basketItems.length === 0) return null;

      const priced = await axiosClient.post<Quote>('/orders/quote', {
        items: basketItems,
        ...(code ? { couponCode: code } : {}),
      });
      setQuote(priced);
      return priced;
    },
    [basketItems],
  );

  useEffect(() => {
    refreshQuote(appliedCode).catch((error) =>
      console.error('Failed to price the basket:', error),
    );
  }, [refreshQuote, appliedCode]);

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;

    setIsApplying(true);
    try {
      await refreshQuote(code);
      setAppliedCode(code);
      setCodeInput('');
      toast.success(`Code ${code.toUpperCase()} applied.`);
    } catch (error) {
      // The quote failed, so the previous total still stands — put it back.
      await refreshQuote(appliedCode).catch(() => {});
      toast.error(getErrorMessage(error, 'This promo code is not valid'));
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveCode = async () => {
    setAppliedCode(null);
    await refreshQuote(null).catch(() => {});
  };

  // Step 1: Submit Address -> Create Order -> Create Payment Intent
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAddress) {
      toast.error('Choose a shipping address first.');
      return;
    }
    if (!cart) return;

    setIsSubmitting(true);
    try {
      // The order is priced again server-side; the quote above was only a preview.
      const orderResponse = await axiosClient.post<ApiEnvelope<Order>>('/orders', {
        items: basketItems,
        addressId: selectedAddress.id,
        ...(appliedCode ? { couponCode: appliedCode } : {}),
      });
      const createdOrder = orderResponse.data;

      if (!createdOrder?.id) throw new Error('Order creation failed to return an ID');

      // Prices can move between quoting and committing.
      if (quote && Number(createdOrder.total) !== Number(quote.total)) {
        toast.info('Some prices changed while you were checking out — the total has been updated.');
      }

      const paymentResponse = await axiosClient.post<
        ApiEnvelope<{ clientSecret: string; paymentId: string }>
      >('/payments/create-intent', {
        orderId: createdOrder.id,
      });

      setCurrentOrderId(createdOrder.id);
      setClientSecret(paymentResponse.data.clientSecret);

    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to initialize payment.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!cart) return null;

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-10">

        <button onClick={() => navigate('/cart')} className="flex items-center space-x-2 text-gray-400 hover:text-black transition-colors mb-10">
          <ArrowLeft size={16} />
          <span className="text-xs font-semibold uppercase tracking-widest">Back to Cart</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

          {/* LEFT COLUMN: Forms */}
          <div className="lg:col-span-7 space-y-8">

            {/* STEP 1: Shipping Address */}
            {!clientSecret ? (
              <div className="bg-surface-muted rounded-3xl p-6 sm:p-10 border border-gray-100">
                <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Shipping Details</h2>
                <p className="text-xs font-medium text-gray-500 mb-8">
                  Pick where this order should go. Your default address is selected for you.
                </p>

                <AddressBook
                  selectedId={selectedAddress?.id ?? null}
                  onSelect={setSelectedAddress}
                />

                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  disabled={isSubmitting || !selectedAddress}
                  className="mt-8 w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-gray-800 transition-all shadow-lg shadow-black/10 flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <span>Continue to Payment</span>}
                </button>

                {!selectedAddress && (
                  <p className="mt-3 text-center text-xs font-medium text-gray-400">
                    Add or choose an address to continue.
                  </p>
                )}
              </div>
            ) : (
              /* STEP 2: Secure Payment Form */
              <div className="bg-white rounded-3xl p-10 border border-gray-200 shadow-xl shadow-gray-200/50">
                <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 pb-6">
                  <CreditCard className="text-brand-ink" size={28} />
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Payment Method</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Encrypted & Secure</p>
                  </div>
                </div>

                {/* Wrap the form in Stripe's Elements provider */}
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                  <PaymentForm orderId={currentOrderId!} />
                </Elements>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Order Summary */}
          <div className="lg:col-span-5">
            <div className="bg-[#F5F5F7] rounded-3xl p-8 border border-gray-100 sticky top-24">
              <h2 className="text-xl font-black uppercase tracking-tight mb-6">In Your Bag</h2>

              <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4 mb-8">
                {cart.cartItems.map((item) => (
                  <div key={item.id} className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-white rounded-xl p-2 flex items-center justify-center shrink-0 border border-gray-100">
                      <img
                        src={item.product.imageUrl || PRODUCT_PLACEHOLDER}
                        onError={(e) => { e.currentTarget.src = PRODUCT_PLACEHOLDER; }}
                        alt=""
                        className="max-h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold truncate uppercase">{item.product.name}</h4>
                      {item.variantLabel && (
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                          {item.variantLabel}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 font-bold tracking-widest uppercase mt-1">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-black">${(Number(item.unitPrice) * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              {/* Promo code. The server decides whether it is valid and what it
                  is worth; this box only relays the answer. */}
              <div className="border-t border-gray-200 pt-6 mb-6">
                {appliedCode && quote?.coupon ? (
                  <div className="flex items-center justify-between bg-state-success-soft rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag size={14} className="text-state-success shrink-0" />
                      <span className="text-xs font-black uppercase tracking-widest text-state-success truncate">
                        {quote.coupon.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCode}
                      className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-black transition-colors shrink-0 ml-3"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCode} className="flex gap-2">
                    <input
                      type="text"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder="Promo code"
                      aria-label="Promo code"
                      className="flex-1 min-w-0 bg-white border-2 border-transparent focus:border-black rounded-2xl py-3 px-4 text-sm font-medium outline-none transition-all"
                    />
                    <button
                      type="submit"
                      disabled={isApplying || !codeInput.trim()}
                      className="bg-black text-white px-5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-800 transition-all disabled:opacity-40 shrink-0"
                    >
                      {isApplying ? <Loader2 className="animate-spin" size={14} /> : 'Apply'}
                    </button>
                  </form>
                )}
              </div>

              {/* Every line below is the server's number, not a browser sum. */}
              <div className="space-y-3 border-t border-gray-200 pt-6 mb-6">
                <div className="flex justify-between text-sm font-bold text-gray-500">
                  <span>Subtotal</span>
                  <span className="text-black">${(quote?.subtotal ?? 0).toFixed(2)}</span>
                </div>

                {quote && quote.discountAmount > 0 && (
                  <div className="flex justify-between text-sm font-bold text-state-success">
                    <span>Discount</span>
                    <span>−${quote.discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-bold text-gray-500">
                  <span>Shipping</span>
                  {quote?.shippingFee === 0 ? (
                    <span className="text-state-success">Free</span>
                  ) : (
                    <span className="text-black">${(quote?.shippingFee ?? 0).toFixed(2)}</span>
                  )}
                </div>

                <div className="flex justify-between text-sm font-bold text-gray-500">
                  <span>Tax{quote ? ` (${(quote.taxRate * 100).toFixed(0)}%)` : ''}</span>
                  <span className="text-black">${(quote?.taxAmount ?? 0).toFixed(2)}</span>
                </div>

                {quote && quote.amountToFreeShipping > 0 && (
                  <p className="text-xs font-medium text-brand-ink bg-brand-soft rounded-xl px-3 py-2.5 !mt-4">
                    Spend ${quote.amountToFreeShipping.toFixed(2)} more for free shipping.
                  </p>
                )}
              </div>

              <div className="flex justify-between items-end border-t border-gray-200 pt-6">
                <span className="text-sm font-black uppercase text-gray-500">Total Due</span>
                <span className="text-4xl font-black tracking-tighter text-black">
                  ${(quote?.total ?? 0).toFixed(2)}
                </span>
              </div>

              <div className="mt-8 flex items-center justify-center space-x-2 text-gray-400">
                <ShieldCheck size={18} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Secured by Stripe</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Checkout;