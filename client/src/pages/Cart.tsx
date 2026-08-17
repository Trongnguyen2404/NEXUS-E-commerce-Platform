import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ArrowRight, ShoppingBag, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useCartStore } from '../store/useCartStore';

const Cart = () => {
  const navigate = useNavigate();
  const { cart, fetchCart } = useCartStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Việc chặn người chưa đăng nhập đã do ProtectedRoute lo, không cần tự kiểm
  // tra localStorage ở đây nữa.
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchCart();
      setIsLoading(false);
    };
    loadData();
  }, []);

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

      <div className="flex flex-col lg:flex-row gap-12 items-start">
        <div className="flex-1 w-full space-y-6">
          {cart.cartItems.map((item) => (
            <div key={item.id} className={`flex gap-6 bg-white border border-gray-200 p-6 rounded-2xl ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="w-32 h-32 bg-[#F3F4F6] rounded-xl p-4 flex items-center justify-center shrink-0">
                <img src={item.product.imageUrl || ''} alt={item.product.name} className="max-h-full object-contain mix-blend-multiply" />
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
                  {/* unitPrice, not product.price — a variant may cost more. */}
                  <p className="text-xl font-black">${Number(item.unitPrice).toFixed(2)}</p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center border border-gray-200 rounded-lg">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1.5 text-gray-500 hover:text-black font-bold">-</button>
                    <span className="px-3 font-bold text-sm w-8 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1.5 text-gray-500 hover:text-black font-bold">+</button>
                  </div>

                  <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors flex items-center space-x-1">
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
              {/* Fix lỗi số dài ngoằng ở đây */}
              <span className="font-bold">${Number(cart.totalPrice).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Shipping</span>
              <span className="font-bold text-green-600">Free</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Estimated Tax</span>
              <span className="font-bold">$0.00</span>
            </div>
          </div>

          <div className="flex justify-between items-end mb-8">
            <span className="text-base font-bold uppercase text-gray-500">Total</span>
            {/* Fix lỗi số dài ngoằng ở đây */}
            <span className="text-4xl font-black leading-none">${Number(cart.totalPrice).toFixed(2)}</span>
          </div>

          <button
            onClick={() => navigate('/checkout')} // CHANGE THIS LINE
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