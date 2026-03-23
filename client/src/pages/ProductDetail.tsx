import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Truck, ShieldCheck, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient from '../api/axiosClient';
// IMPORT STORE ĐỂ CẬP NHẬT NAVBAR
import { useCartStore } from '../store/useCartStore'; 

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  
  // Lấy hàm fetchCart từ Store
  const { fetchCart } = useCartStore();

  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      try {
        const res: any = await axiosClient.get(`/products/${id}`);
        setProduct(res);
        const relRes: any = await axiosClient.get('/products', { 
          params: { category: res.category, limit: 4 } 
        });
        setRelated(relRes.data.filter((p: any) => p.id !== id));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
        window.scrollTo(0, 0);
      }
    };
    fetchDetail();
  }, [id]);

  const handleAddToCart = async (redirect = false) => {
    if (!localStorage.getItem('accessToken')) {
      toast.error('Please sign in to purchase!'); // Đã chuyển sang English
      navigate('/login');
      return;
    }

    setIsAddingToCart(true);
    try {
      await axiosClient.post('/cart/items', {
        productId: product.id,
        quantity: quantity
      });
      
      await fetchCart(); 
      toast.success('Added to cart successfully!'); // Đã chuyển sang English
      
      if (redirect) {
        navigate('/cart');
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred while adding to cart.'); // Đã chuyển sang English
    } finally {
      setIsAddingToCart(false);
    }
  };

  if (isLoading) return (
    <div className="h-[80vh] flex items-center justify-center bg-white">
      <Loader2 className="animate-spin text-black" size={40} />
    </div>
  );

  return (
    <div className="bg-white min-h-screen pb-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Nút Back Tối giản */}
        <button onClick={() => navigate(-1)} className="flex items-center space-x-2 text-gray-400 hover:text-black transition-colors mb-8">
          <ArrowLeft size={16} />
          <span className="text-xs font-semibold uppercase tracking-widest">Back</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start">
          
          {/* CỘT TRÁI: Hình ảnh (UI chuẩn Apple/Boutique) */}
          <div className="space-y-4">
            <div className="bg-[#F5F5F7] rounded-2xl p-12 flex items-center justify-center aspect-square border border-gray-100">
              <img 
                src={product.imageUrl || ''} 
                alt={product.name} 
                className="w-full h-full object-contain mix-blend-multiply drop-shadow-xl" 
              />
            </div>
            
            {/* Thumbnails thanh lịch */}
            <div className="flex space-x-3">
              <div className="w-20 h-16 bg-[#F5F5F7] rounded-lg border-2 border-black flex items-center justify-center p-2 cursor-pointer">
                <img src={product.imageUrl || ''} className="max-h-full object-contain mix-blend-multiply" />
              </div>
              <div className="w-20 h-16 bg-[#F5F5F7] rounded-lg border border-transparent hover:border-gray-300 flex items-center justify-center p-2 cursor-pointer transition-colors">
                <img src={product.imageUrl || ''} className="max-h-full object-contain mix-blend-multiply opacity-60" />
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: Thông tin */}
          <div className="py-2 flex flex-col h-full">
            <p className="text-blue-600 text-[11px] font-bold uppercase tracking-[0.15em] mb-3">
              {product.category}
            </p>
            <h1 className="text-4xl lg:text-5xl font-black text-black uppercase tracking-tight mb-4 leading-[1.1]">
              {product.name}
            </h1>
            <p className="text-3xl font-bold text-black mb-8">
              ${product.price}
            </p>

            <div className="text-gray-700 text-sm leading-relaxed mb-8 whitespace-pre-line font-medium">
              {product.description || "The ultimate performance tool designed for precision."}
            </div>

            {/* Badges dạng outline tinh tế */}
            <div className="flex space-x-3 mb-8">
              <div className="flex items-center space-x-2 border border-gray-200 px-4 py-2.5 rounded-lg">
                <Truck size={18} strokeWidth={1.5} className="text-black" />
                <div className="text-[10px] font-bold text-black uppercase tracking-widest leading-tight">Fast<br/>Shipping</div>
              </div>
              <div className="flex items-center space-x-2 border border-gray-200 px-4 py-2.5 rounded-lg">
                <ShieldCheck size={18} strokeWidth={1.5} className="text-black" />
                <div className="text-[10px] font-bold text-black uppercase tracking-widest leading-tight">2 Year<br/>Warranty</div>
              </div>
            </div>

            {/* ACTION ROW: Gọn gàng, vuông vức */}
            <div className="flex items-center gap-4 mb-12">
              <div className="flex items-center justify-between border border-gray-300 rounded-lg px-2 h-14 w-32">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="text-gray-500 hover:text-black font-light text-2xl px-3">-</button>
                <span className="font-semibold text-base">{quantity}</span>
                <button onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} className="text-gray-500 hover:text-black font-light text-2xl px-3">+</button>
              </div>

              <button 
                onClick={() => handleAddToCart(false)}
                disabled={isAddingToCart}
                className="flex-1 h-14 bg-black text-white font-bold text-xs tracking-widest uppercase rounded-lg hover:bg-gray-900 transition-all disabled:opacity-50"
              >
                {isAddingToCart ? 'Adding...' : 'Add to Cart'}
              </button>
              
              <button 
                onClick={() => handleAddToCart(true)}
                disabled={isAddingToCart}
                className="flex-1 h-14 bg-blue-600 text-white font-bold text-xs tracking-widest uppercase rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
              >
                Buy Now
              </button>
            </div>

            {/* Related Gear */}
            {related.length > 0 && (
              <div className="mt-auto pt-8 border-t border-gray-200">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">You Might Also Like</p>
                <div className="grid grid-cols-4 gap-4">
                  {related.slice(0, 4).map((p) => (
                    <div 
                      key={p.id} 
                      onClick={() => navigate(`/products/${p.id}`)}
                      className="group cursor-pointer"
                    >
                      <div className="aspect-square bg-[#F5F5F7] rounded-lg p-3 flex items-center justify-center mb-3 border border-transparent group-hover:border-gray-300 transition-colors">
                        <img src={p.imageUrl || ''} className="max-h-full object-contain mix-blend-multiply" />
                      </div>
                      <p className="font-bold text-black text-sm leading-none">${p.price}</p>
                      <p className="text-[10px] font-semibold text-gray-500 truncate uppercase mt-1">{p.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;