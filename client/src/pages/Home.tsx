import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, ShieldCheck, Zap, Globe, RotateCcw } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import ProductCard from '../components/ProductCard';
import CategoryArt from '../components/CategoryArt';
import { pickNewArrivals } from '../components/newArrivals';
import useQuickAdd from '../hooks/useQuickAdd';
import type { Category, PageResponse, PaginatedResponse, Product } from '../types/api';
import useDocumentMeta from '../hooks/useDocumentMeta';

// Keep the category row full even when the store has 2 or 3 collections.
const CATEGORY_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

const PROMISES = [
  { icon: Globe, title: 'Global shipping', copy: 'Fast, tracked delivery to over 100 countries worldwide.' },
  { icon: ShieldCheck, title: '2-year warranty', copy: 'Every piece of gear is backed by our hardware warranty.' },
  { icon: RotateCcw, title: '30-day returns', copy: 'Changed your mind? Send it back within 30 days, free.' },
  { icon: Zap, title: 'Peak performance', copy: 'Engineered for uncompromising speed and precision.' },
];

// Landing page: hero, promises, categories and new arrivals.
const Home = () => {
  useDocumentMeta({ title: 'NEXUS', description: 'Premium electronics and audio, engineered for people who work with their gear every day. Free shipping over $100, two-year warranty, 30-day returns.' });
  const navigate = useNavigate();
  const { quickAdd, addingId } = useQuickAdd();
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
      setIsLoading(true);
      try {

        const [catRes, prodRes] = await Promise.all([
          axiosClient.get<PageResponse<Category>>('/categories', { params: { limit: 4 } }),
          axiosClient.get<PaginatedResponse<Product>>('/products', { params: { limit: 8 } })
        ]);

        setCategories(catRes.data || []);
        setFeaturedProducts(prodRes.data || []);
      } catch (error) {
        console.error('Failed to fetch home data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHomeData();
  }, []);

  const newArrivals = useMemo(() => pickNewArrivals(featuredProducts), [featuredProducts]);

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  return (
    <div className="bg-white">
      <section className="relative bg-[#F5F5F7] overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center min-h-[75vh] py-20 gap-12">
            <div className="flex-1 space-y-8 z-10">
              <div className="inline-block bg-black text-white px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full">
                New Collection 2026
              </div>
              <h1 className="text-6xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.9]">
                Master <br/> Your Craft.
              </h1>
              <p className="text-lg text-gray-600 max-w-md font-medium leading-relaxed">
                Discover premium performance gear engineered for professionals and enthusiasts. Uncompromising quality meets minimalist design.
              </p>
              <Link to="/products" className="inline-flex items-center space-x-3 bg-brand text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-brand-ink transition-all shadow-lg shadow-brand/30">
                <span>Shop Now</span>
                <ArrowRight size={18} />
              </Link>
            </div>
            
            <div className="flex-1 relative w-full h-[400px] lg:h-[500px] flex items-center justify-center">
               <div className="absolute w-full h-full bg-gradient-to-tr from-gray-300 to-[#F5F5F7] rounded-full blur-3xl opacity-40"></div>
               <img
                 
                 src={featuredProducts[0]?.imageUrl || "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?q=80&w=1000&auto=format&fit=crop"}
                 alt="Hero Gear"
                 className="relative z-10 w-full h-full object-contain drop-shadow-2xl mix-blend-multiply"
               />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {PROMISES.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="h-11 w-11 shrink-0 rounded-2xl bg-surface-muted flex items-center justify-center">
                  <Icon size={20} strokeWidth={1.75} className="text-black" />
                </div>
                <div>
                  <h3 className="font-black uppercase tracking-widest text-[11px] mb-1.5">{title}</h3>
                  <p className="text-gray-500 text-[13px] font-medium leading-relaxed">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="py-24 bg-white">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-end mb-12">
              <h2 className="text-4xl font-black uppercase tracking-tight">Shop by Category</h2>
              <Link to="/categories" className="text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-black transition-colors flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight size={16} />
              </Link>
            </div>
            <div
              className={`grid gap-6 ${
                CATEGORY_GRID[categories.length] ?? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              }`}
            >
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  // Filter by slug so the listing page can show it as selected.
                  onClick={() => navigate(`/products?category=${cat.slug ?? cat.name}`)}
                  className="group relative aspect-[4/5] sm:aspect-square bg-black rounded-3xl overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                  <CategoryArt category={cat} />

                  {/* A scrim instead of a washed-out image keeps the photo rich
                      while the label stays readable on any picture. */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-7 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xl font-black text-white uppercase tracking-tight leading-tight">
                        {cat.name}
                      </h3>
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1.5">
                        {cat.productCount ?? 0} {cat.productCount === 1 ? 'Product' : 'Products'}
                      </p>
                    </div>
                    <span className="h-11 w-11 shrink-0 rounded-full bg-white text-black flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors">
                      <ArrowRight size={18} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {featuredProducts.length > 0 && (
        <section className="py-24 bg-[#F5F5F7]">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-end mb-12">
              <h2 className="text-4xl font-black uppercase tracking-tight">New Arrivals</h2>
              <Link to="/products" className="text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-black transition-colors flex items-center space-x-1">
                <span>View All Gear</span>
                <ArrowRight size={16} />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onQuickAdd={quickAdd}
                  isAdding={addingId === p.id}
                  isNew={newArrivals.has(p.id)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-black text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          <div className="max-w-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">
              Built for the long haul
            </p>
            <h2 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter leading-[0.95]">
              Gear that earns
              <br />
              its desk space.
            </h2>
            <p className="mt-6 text-white/60 font-medium leading-relaxed">
              Free shipping over $100, a two-year warranty on everything, and 30 days to change
              your mind.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 shrink-0">
            <Link
              to="/products"
              className="inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors"
            >
              <span>Shop all gear</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-3 border border-white/25 px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-colors"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;