import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Loader2, Truck, ShieldCheck, ChevronRight, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';

import { useCartStore } from '../store/useCartStore';
import StarRating from '../components/StarRating';
import WishlistButton from '../components/WishlistButton';
import ProductReviews from '../components/ProductReviews';
import VariantPicker from '../components/VariantPicker';
import ProductCard from '../components/ProductCard';
import { pickNewArrivals } from '../components/newArrivals';
import useQuickAdd from '../hooks/useQuickAdd';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';
import type { PaginatedResponse, Product, ProductVariant } from '../types/api';

// Product page: gallery, options, buy actions, reviews and related items.
const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { quickAdd, addingId } = useQuickAdd();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  
  const [activeImage, setActiveImage] = useState(0);

  
  const { fetchCart } = useCartStore();

  useEffect(() => {
    // The router reuses this component instance across /products/:id hops, so
    // every piece of per-product state has to be dropped here. Leaving `product`
    // behind renders the previous product under the new URL (and Add to Cart
    // posts its id); leaving `selectedVariant` behind prices and buys a variant
    // that does not belong to the product on screen.
    let cancelled = false;
    setIsLoading(true);
    setProduct(null);
    setRelated([]);
    setSelectedVariant(null);
    setQuantity(1);
    setActiveImage(0);

    const fetchDetail = async () => {
      try {
        const res = await axiosClient.get<Product>(`/products/${id}`);
        if (cancelled) return;
        setProduct(res);

        // Pull from the same category first, then top up from the rest of the
        // catalogue — a one-product category used to render nothing at all.
        const sameCategory = await axiosClient.get<PaginatedResponse<Product>>('/products', {
          params: { category: res.category, limit: 5 },
        });
        let picks = sameCategory.data.filter((p) => p.id !== id);

        if (picks.length < 4) {
          const fallback = await axiosClient.get<PaginatedResponse<Product>>('/products', {
            params: { limit: 8 },
          });
          const seen = new Set([id, ...picks.map((p) => p.id)]);
          picks = [...picks, ...fallback.data.filter((p) => !seen.has(p.id))];
        }

        if (cancelled) return;
        setRelated(picks.slice(0, 4));
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchDetail();

    // A late response from the product we just left must not overwrite this one.
    return () => {
      cancelled = true;
    };
  }, [id]);

  
  
  
  const relatedNewArrivals = useMemo(() => pickNewArrivals(related), [related]);

  useDocumentMeta({
    title: product?.name ?? 'Product',
    description: product
      ? `${product.description ?? product.name} — $${Number(product.price).toFixed(2)} at NEXUS.`
      : undefined,
    image: product?.imageUrl ?? undefined,
  });

  const refreshProduct = useCallback(async () => {
    try {
      setProduct(await axiosClient.get<Product>(`/products/${id}`));
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  const handleAddToCart = async (redirect = false) => {
    if (!localStorage.getItem('accessToken')) {
      toast.error('Please sign in to purchase!'); 
      navigate('/login');
      return;
    }

    if (!product) return;

    
    
    if (product.hasVariants && !selectedVariant) {
      toast.error('Choose an option first.');
      return;
    }

    setIsAddingToCart(true);
    try {
      await axiosClient.post('/cart/items', {
        productId: product.id,
        quantity: quantity,
        ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
      });
      
      await fetchCart(); 
      toast.success('Added to cart successfully!'); 
      
      if (redirect) {
        navigate('/cart');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'An error occurred while adding to cart.'));
    } finally {
      setIsAddingToCart(false);
    }
  };

  if (isLoading) return (
    <div className="h-[80vh] flex items-center justify-center bg-white">
      <Loader2 className="animate-spin text-black" size={40} />
    </div>
  );

  
  
  if (!product) return (
    <div className="h-[70vh] flex flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-4xl font-black uppercase tracking-tight mb-4">Product not found</h1>
      <p className="text-sm font-medium text-gray-500 mb-8">
        This product may have been removed or is no longer available.
      </p>
      <button
        onClick={() => navigate('/products')}
        className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all"
      >
        Browse products
      </button>
    </div>
  );

  
  const gallery = product.images?.length
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : [];

  return (
    <div className="bg-white min-h-screen pb-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 mb-8 text-[11px] font-bold uppercase tracking-widest text-gray-400">
          <Link to="/" className="hover:text-black transition-colors">Home</Link>
          <ChevronRight size={13} aria-hidden />
          <Link to="/products" className="hover:text-black transition-colors">Products</Link>
          {product.category && (
            <>
              <ChevronRight size={13} aria-hidden />
              <Link
                to={`/products?category=${encodeURIComponent(product.category)}`}
                className="hover:text-black transition-colors"
              >
                {product.category}
              </Link>
            </>
          )}
          <ChevronRight size={13} aria-hidden />
          <span className="text-black truncate max-w-[16rem]" aria-current="page">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start">
          
          <div className="space-y-4">
            <div className="relative bg-[#F5F5F7] rounded-2xl p-12 flex items-center justify-center aspect-square border border-gray-100">
              <img
                src={selectedVariant?.imageUrl || gallery[activeImage] || PRODUCT_PLACEHOLDER}
                alt={product.name}
                className="w-full h-full object-contain mix-blend-multiply drop-shadow-xl"
                onError={(e) => {
                  e.currentTarget.src = PRODUCT_PLACEHOLDER;
                }}
              />
              <WishlistButton productId={product.id} className="absolute top-5 right-5" size={20} />
            </div>

            {gallery.length > 1 && (
              <div className="flex flex-wrap gap-3" role="group" aria-label="Product images">
                {gallery.map((url, index) => {
                  const isActive = !selectedVariant?.imageUrl && index === activeImage;

                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`Show image ${index + 1} of ${gallery.length}`}
                      aria-pressed={isActive}
                      className={`w-20 h-16 bg-[#F5F5F7] rounded-lg flex items-center justify-center p-2 transition-all ${
                        isActive
                          ? 'border-2 border-black'
                          : 'border border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={url}
                        alt=""
                        className="max-h-full object-contain mix-blend-multiply"
                        onError={(e) => {
                          e.currentTarget.src = PRODUCT_PLACEHOLDER;
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="py-2 flex flex-col h-full">
            <p className="text-brand-ink text-[11px] font-bold uppercase tracking-[0.15em] mb-3">
              {product.category}
            </p>
            <h1 className="text-4xl lg:text-5xl font-black text-black uppercase tracking-tight mb-4 leading-[1.1]">
              {product.name}
            </h1>

            <a href="#reviews" className="inline-flex items-center gap-2 mb-4 group/rating">
              <StarRating value={product.rating} size={16} />
              <span className="text-xs font-bold text-gray-500 group-hover/rating:text-black transition-colors">
                {product.reviewCount > 0
                  ? `${product.rating.toFixed(1)} · ${product.reviewCount} review${product.reviewCount === 1 ? '' : 's'}`
                  : 'No reviews yet'}
              </span>
            </a>

            <p className="text-3xl font-bold text-black mb-8">
              {product.hasVariants && !selectedVariant && (
                <span className="text-base font-bold text-gray-400 mr-2">From</span>
              )}
              ${Number(selectedVariant?.price ?? product.price).toFixed(2)}
            </p>

            <div className="text-gray-700 text-sm leading-relaxed mb-8 whitespace-pre-line font-medium">
              {product.description || "The ultimate performance tool designed for precision."}
            </div>

            {product.hasVariants && (
              // Keyed by product so the picker's own selection state cannot
              // survive a hop to another product's page.
              <VariantPicker key={product.id} variants={product.variants} onChange={setSelectedVariant} />
            )}

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: Truck, title: 'Fast', sub: 'Shipping' },
                { icon: ShieldCheck, title: '2 Year', sub: 'Warranty' },
                { icon: RotateCcw, title: '30 Day', sub: 'Returns' },
              ].map(({ icon: Icon, title, sub }) => (
                <div key={title} className="flex items-center gap-2.5 bg-surface-muted px-4 py-3 rounded-xl">
                  <Icon size={18} strokeWidth={1.5} className="text-black shrink-0" />
                  <div className="text-[10px] font-bold text-black uppercase tracking-widest leading-tight">
                    {title}<br />{sub}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 mb-12">
              <div className="flex items-center justify-between border border-gray-300 rounded-lg px-2 h-14 w-32">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="text-gray-500 hover:text-black font-light text-2xl px-3">-</button>
                <span className="font-semibold text-base">{quantity}</span>
                <button onClick={() => setQuantity(q => Math.min(selectedVariant?.stock ?? product.stock, q + 1))} className="text-gray-500 hover:text-black font-light text-2xl px-3">+</button>
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
                className="flex-1 h-14 bg-brand text-white font-bold text-xs tracking-widest uppercase rounded-lg hover:bg-brand-ink transition-all shadow-md shadow-brand/20 disabled:opacity-50"
              >
                Buy Now
              </button>
            </div>

          </div>
        </div>

        <div id="reviews">
          <ProductReviews productId={product.id} onRatingChange={refreshProduct} />
        </div>

        {related.length > 0 && (
          <section className="mt-20 pt-16 border-t border-gray-200">
            <div className="flex items-end justify-between mb-10">
              <h2 className="text-3xl font-black uppercase tracking-tight">You might also like</h2>
              <Link
                to="/products"
                className="text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
              >
                View all
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {related.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onQuickAdd={quickAdd}
                  isAdding={addingId === p.id}
                  isNew={relatedNewArrivals.has(p.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;