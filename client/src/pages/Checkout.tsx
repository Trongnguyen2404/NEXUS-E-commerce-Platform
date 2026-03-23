import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Loader2, CreditCard } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';

// Stripe Imports
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// ==========================================
// ⚠️ Replace with your actual Stripe Public Key
// ==========================================
const stripePromise = loadStripe('pk_test_51TDrt41h8wor8q38Bu9azh8upAzegeMWFAtI3AQqXnhqt6IN18HStRarkvmhryuwWGpq60MbcWjobiYqjftsaNuj00WGRCGbON');

// ------------------------------------------------------------------
// COMPONENT 1: The Stripe Payment Form (Rendered in Step 2)
// ------------------------------------------------------------------
const PaymentForm = ({ orderId, clientSecret }: { orderId: string, clientSecret: string }) => {
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

        // 3. Delete Cart items after successful payment
        await axiosClient.delete('/cart');
        await fetchCart();

        toast.success('Payment successful! Order completed.');
        navigate('/account');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error confirming payment on server.');
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
        className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center disabled:opacity-50"
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
  
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for Step 2 (Payment)
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      navigate('/login');
      return;
    }
    if (!cart || cart.cartItems.length === 0) {
      fetchCart().then(() => {
        if (!useCartStore.getState().cart?.cartItems?.length) navigate('/cart');
      });
    }
  }, [cart, navigate, fetchCart]);

  // Step 1: Submit Address -> Create Order -> Create Payment Intent
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) {
      toast.error('Please enter your shipping address.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create the Order in your database (Status: PENDING)
      const orderData = {
        shippingAddress: address,
        items: cart.cartItems.map((item: any) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: Number(item.product.price)
        }))
      };

      const orderResponse: any = await axiosClient.post('/orders', orderData);
      // Adjust this based on exactly what your POST /orders returns (e.g., orderResponse.id or orderResponse.data.id)
      const createdOrderId = orderResponse.id || orderResponse.data?.id; 

      if (!createdOrderId) throw new Error('Order creation failed to return an ID');

      // 2. Call your PaymentsController to create a Stripe Intent
      const paymentResponse: any = await axiosClient.post('/payments/create-intent', {
        orderId: createdOrderId,
        amount: Number(cart.totalPrice)
      });

      // 3. Move to Step 2 (Show Stripe Form)
      setCurrentOrderId(createdOrderId);
      setClientSecret(paymentResponse.data.clientSecret);
      
    } catch (error: any) {
      toast.error(error.message || 'Failed to initialize payment.');
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
              <div className="bg-[#F5F5F7] rounded-3xl p-10 border border-gray-100">
                <h2 className="text-2xl font-black uppercase tracking-tight mb-8">Shipping Details</h2>
                <form onSubmit={handleProceedToPayment} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Full Shipping Address</label>
                    <textarea 
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street name, Apartment, City, Postal Code"
                      className="w-full bg-white border-none rounded-2xl py-5 px-5 text-sm focus:ring-2 focus:ring-black outline-none font-medium resize-none min-h-[120px] shadow-sm"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-gray-800 transition-all shadow-lg shadow-black/10 flex items-center justify-center space-x-3 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <span>Continue to Payment</span>}
                  </button>
                </form>
              </div>
            ) : (
              /* STEP 2: Secure Payment Form */
              <div className="bg-white rounded-3xl p-10 border border-gray-200 shadow-xl shadow-gray-200/50">
                <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 pb-6">
                  <CreditCard className="text-blue-600" size={28} />
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Payment Method</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Encrypted & Secure</p>
                  </div>
                </div>

                {/* Wrap the form in Stripe's Elements provider */}
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                  <PaymentForm orderId={currentOrderId!} clientSecret={clientSecret} />
                </Elements>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Order Summary */}
          <div className="lg:col-span-5">
            <div className="bg-[#F5F5F7] rounded-3xl p-8 border border-gray-100 sticky top-24">
              <h2 className="text-xl font-black uppercase tracking-tight mb-6">In Your Bag</h2>
              
              <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4 mb-8">
                {cart.cartItems.map((item: any) => (
                  <div key={item.id} className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-white rounded-xl p-2 flex items-center justify-center shrink-0 border border-gray-100">
                      <img src={item.product.imageUrl || ''} alt="" className="max-h-full mix-blend-multiply" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold truncate uppercase">{item.product.name}</h4>
                      <p className="text-xs text-gray-500 font-bold tracking-widest uppercase mt-1">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-black">${(Number(item.product.price) * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-gray-200 pt-6 mb-6">
                <div className="flex justify-between text-sm font-bold text-gray-500">
                  <span>Subtotal</span>
                  <span className="text-black">${Number(cart.totalPrice).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-gray-500">
                  <span>Shipping</span>
                  <span className="text-green-600">Free</span>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-gray-200 pt-6">
                <span className="text-sm font-black uppercase text-gray-500">Total Due</span>
                <span className="text-4xl font-black tracking-tighter text-black">${Number(cart.totalPrice).toFixed(2)}</span>
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