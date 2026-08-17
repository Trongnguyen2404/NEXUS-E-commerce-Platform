import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { useWishlistStore } from '../store/useWishlistStore';
import WishlistButton from '../components/WishlistButton';
import StarRating from '../components/StarRating';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';

const Wishlist = () => {
  const navigate = useNavigate();
  const { products, isLoading, fetchWishlist } = useWishlistStore();

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  if (isLoading && products.length === 0) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-50 rounded-full mb-8">
          <Heart size={40} className="text-gray-300" />
        </div>
        <h2 className="text-4xl font-black uppercase tracking-tight mb-4">Nothing saved yet</h2>
        <p className="text-gray-500 mb-10 font-medium">
          Tap the heart on any product to keep it here for later.
        </p>
        <Link
          to="/products"
          className="inline-block bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-colors"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-black uppercase tracking-tight">Your wishlist</h1>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">
          {products.length} saved item{products.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {products.map((product) => (
          <div
            key={product.id}
            onClick={() => navigate(`/products/${product.id}`)}
            className="group cursor-pointer flex flex-col bg-white border border-gray-200 rounded-3xl overflow-hidden hover:border-gray-400 hover:shadow-lg transition-all"
          >
            <div className="relative bg-surface-muted aspect-square flex items-center justify-center p-6 overflow-hidden">
              <img
                src={product.imageUrl || PRODUCT_PLACEHOLDER}
                onError={(e) => { e.currentTarget.src = PRODUCT_PLACEHOLDER; }}
                alt={product.name}
                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
              />
              <WishlistButton productId={product.id} className="absolute top-4 right-4" />
            </div>

            <div className="flex flex-col flex-1 p-5 border-t border-gray-100">
              <h3 className="font-bold text-sm uppercase truncate">{product.name}</h3>

              {product.reviewCount > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <StarRating value={product.rating} size={12} />
                  <span className="text-[10px] font-bold text-gray-400">({product.reviewCount})</span>
                </div>
              )}

              <p className="text-lg font-black mt-2">${Number(product.price).toFixed(2)}</p>

              {product.stock === 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-state-danger mt-1">
                  Out of stock
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Wishlist;
