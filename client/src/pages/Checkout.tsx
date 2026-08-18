import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Loader2, CreditCard, Tag, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';
import AddressBook from '../components/AddressBook';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';
import type { Address, ApiEnvelope, Order, Quote } from '../types/api';


import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';




const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);



// Money only ever compares as whole cents; 202.04 against 202.04000000000002 is
// the same charge and must not read as a price change.
const cents = (value: number | string) => Math.round(Number(value) * 100);

// The server re-prices the basket inside the order transaction, so the created
// order — not the quote that preceded it — is what Stripe will charge. Re-point
// the summary at those figures instead of leaving the stale quote on screen.
const quoteFromOrder = (previous: Quote, order: Order): Quote => {
  const discountAmount = cents(order.discountAmount) / 100;
  const shippingFee = cents(order.shippingFee) / 100;
  const shortfallCents = cents(previous.freeShippingThreshold) - cents(order.subtotal);

  return {
    ...previous,
    subtotal: cents(order.subtotal) / 100,
    discountAmount,
    shippingFee,
    taxAmount: cents(order.taxAmount) / 100,
    total: cents(order.total) / 100,
    amountToFreeShipping: shippingFee === 0 || shortfallCents <= 0 ? 0 : shortfallCents / 100,
    coupon: previous.coupon ? { ...previous.coupon, discountAmount } : null,
  };
};


// Stripe payment step, shown once the order exists.
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
      
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required', 
      });

      if (error) {
        toast.error(error.message || 'Payment failed.');
        setIsProcessing(false);
        return;
      }

      
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





// Two-step checkout: pick an address, then pay.
const Checkout = () => {
  const navigate = useNavigate();
  const { cart, fetchCart } = useCartStore();

  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  
  const [quote, setQuote] = useState<Quote | null>(null);

  
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  // POST /orders is not idempotent — it decrements stock and burns a coupon use.
  // The id has to survive inside the same async handler that created it, so it
  // lives in a ref as well as in state; a retry after a failed create-intent
  // reuses this order rather than placing a second one.
  const createdOrderIdRef = useRef<string | null>(null);

  // Set when the order came back priced differently from the quote the buyer saw.
  const [repricedTotal, setRepricedTotal] = useState<number | null>(null);


  useEffect(() => {
    // Placing the order marks the cart checked out, so from that moment it is
    // *supposed* to be empty. Without this the guard below fired on the next
    // refresh and threw the buyer back to /cart mid-payment, before the Stripe
    // form had rendered — an order created and paid for on a page they never
    // got to see.
    if (currentOrderId) return;

    if (!cart || cart.cartItems.length === 0) {
      fetchCart().then(() => {
        if (!useCartStore.getState().cart?.cartItems?.length) navigate('/cart');
      });
    }
  }, [cart, navigate, fetchCart, currentOrderId]);

  const basketItems = useMemo(
    () =>
      cart?.cartItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        // Carry the chosen option through. Without it the server cannot price
        // a variant product and rejects the basket with "choose an option",
        // which the page rendered as a $0.00 total.
        ...(item.variantId ? { variantId: item.variantId } : {}),
      })) ?? [],
    [cart],
  );

  
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

  
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createdOrderIdRef.current && !selectedAddress) {
      toast.error('Choose a shipping address first.');
      return;
    }
    if (!cart && !createdOrderIdRef.current) return;

    setIsSubmitting(true);
    try {
      let orderId = createdOrderIdRef.current;

      if (!orderId) {
        const orderResponse = await axiosClient.post<ApiEnvelope<Order>>('/orders', {
          items: basketItems,
          addressId: selectedAddress!.id,
          ...(appliedCode ? { couponCode: appliedCode } : {}),
        });
        const createdOrder = orderResponse.data;

        if (!createdOrder?.id) throw new Error('Order creation failed to return an ID');

        // Remember the order before anything else can fail. If create-intent
        // below throws, the next click must resume this order instead of
        // placing a second one against the same basket.
        orderId = createdOrder.id;
        createdOrderIdRef.current = orderId;
        setCurrentOrderId(orderId);

        // The order is priced server-side and Stripe charges that figure, so a
        // mismatch means the buyer is looking at a number they will not pay.
        // Show the real one and make them accept it before the card form opens.
        if (quote && cents(createdOrder.total) !== cents(quote.total)) {
          setQuote(quoteFromOrder(quote, createdOrder));
          setRepricedTotal(cents(createdOrder.total) / 100);
          toast.info('Some prices changed while you were checking out — check the new total.');
          return;
        }
      }

      const paymentResponse = await axiosClient.post<
        ApiEnvelope<{ clientSecret: string; paymentId: string }>
      >('/payments/create-intent', {
        orderId,
      });

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

        <button onClick={() => navigate('/cart')} className="flex items-center space-x-2 text-gray-400 hover:text-black transition-colors mb-8">
          <ArrowLeft size={16} />
          <span className="text-xs font-semibold uppercase tracking-widest">Back to Cart</span>
        </button>

        {/* Two steps, so say which one they are on. */}
        <ol className="flex items-center gap-3 sm:gap-5 mb-10" aria-label="Checkout progress">
          {[
            { n: 1, label: 'Shipping', done: Boolean(clientSecret) },
            { n: 2, label: 'Payment', done: false },
          ].map((step) => {
            const active = clientSecret ? step.n === 2 : step.n === 1;
            return (
              <li key={step.n} className="flex items-center gap-3 sm:gap-5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black transition-colors ${
                      step.done
                        ? 'bg-state-success text-white'
                        : active
                          ? 'bg-black text-white'
                          : 'bg-surface-muted text-gray-400'
                    }`}
                    aria-current={active ? 'step' : undefined}
                  >
                    {step.done ? <Check size={14} strokeWidth={3} /> : step.n}
                  </span>
                  <span
                    className={`text-[11px] font-black uppercase tracking-widest ${
                      active || step.done ? 'text-black' : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {step.n === 1 && <span className="h-px w-8 sm:w-16 bg-gray-200" aria-hidden />}
              </li>
            );
          })}
        </ol>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

          <div className="lg:col-span-7 space-y-8">

            {!clientSecret ? (
              <div className="bg-surface-muted rounded-3xl p-6 sm:p-10 border border-gray-100">
                <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Shipping Details</h2>
                <p className="text-xs font-medium text-gray-500 mb-8">
                  {currentOrderId
                    ? 'Your order is reserved and shipping to the address below.'
                    : 'Pick where this order should go. Your default address is selected for you.'}
                </p>

                {currentOrderId ? (
                  // The order already carries this address, so offering to change
                  // it here would be a control that silently does nothing.
                  <div className="bg-white rounded-2xl px-5 py-4 border border-gray-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Shipping to
                    </p>
                    <p className="text-sm font-bold mt-1">{selectedAddress?.formatted}</p>
                  </div>
                ) : (
                  <AddressBook
                    selectedId={selectedAddress?.id ?? null}
                    onSelect={setSelectedAddress}
                  />
                )}

                {repricedTotal !== null && (
                  <div
                    role="alert"
                    className="mt-6 flex items-start gap-3 bg-brand-soft text-brand-ink rounded-2xl px-4 py-3.5"
                  >
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-medium">
                      Prices changed while you were checking out. Your total is now $
                      {repricedTotal.toFixed(2)} — the summary has been updated. Confirm to pay
                      that amount.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  disabled={isSubmitting || (!selectedAddress && !currentOrderId)}
                  className="mt-8 w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-gray-800 transition-all shadow-lg shadow-black/10 flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <span>
                      {repricedTotal !== null ? 'Confirm New Total' : 'Continue to Payment'}
                    </span>
                  )}
                </button>

                {!selectedAddress && !currentOrderId && (
                  <p className="mt-3 text-center text-xs font-medium text-gray-400">
                    Add or choose an address to continue.
                  </p>
                )}
              </div>
            ) : (
              
              <div className="bg-white rounded-3xl p-10 border border-gray-200 shadow-xl shadow-gray-200/50">
                <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 pb-6">
                  <CreditCard className="text-brand-ink" size={28} />
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Payment Method</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Encrypted & Secure</p>
                  </div>
                </div>

                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                  <PaymentForm orderId={currentOrderId!} />
                </Elements>
              </div>
            )}

          </div>

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