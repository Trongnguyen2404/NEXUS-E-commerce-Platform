import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, ShieldCheck, Zap, Globe } from 'lucide-react';
import axiosClient from '../api/axiosClient';

const Home = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
      setIsLoading(true);
      try {
        // Fetch both Categories and Products concurrently from your Backend
        const [catRes, prodRes] = await Promise.all([
          axiosClient.get('/categories', { params: { limit: 4 } }),
          axiosClient.get('/products', { params: { limit: 4 } })
        ]);
        
        setCategories((catRes as any).data || []);
        setFeaturedProducts((prodRes as any).data || []);
      } catch (error) {
        console.error('Failed to fetch home data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHomeData();
  }, []);

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* HERO SECTION */}
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
              <Link to="/products" className="inline-flex items-center space-x-3 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30">
                <span>Shop Now</span>
                <ArrowRight size={18} />
              </Link>
            </div>
            
            <div className="flex-1 relative w-full h-[400px] lg:h-[500px] flex items-center justify-center">
               <div className="absolute w-full h-full bg-gradient-to-tr from-gray-300 to-[#F5F5F7] rounded-full blur-3xl opacity-40"></div>
               <img
                 // Uses the first product image as the hero image, or a fallback
                 src={featuredProducts[0]?.imageUrl || "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?q=80&w=1000&auto=format&fit=crop"}
                 alt="Hero Gear"
                 className="relative z-10 w-full h-full object-contain drop-shadow-2xl mix-blend-multiply"
               />
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPOSITION */}
      <section className="border-y border-gray-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <Globe size={36} strokeWidth={1.5} className="text-black" />
              <h3 className="font-black uppercase tracking-widest text-sm">Global Shipping</h3>
              <p className="text-gray-500 text-sm font-medium">Fast and secure delivery to over 100 countries worldwide.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <ShieldCheck size={36} strokeWidth={1.5} className="text-black" />
              <h3 className="font-black uppercase tracking-widest text-sm">2-Year Warranty</h3>
              <p className="text-gray-500 text-sm font-medium">Every piece of gear is backed by our comprehensive hardware warranty.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <Zap size={36} strokeWidth={1.5} className="text-black" />
              <h3 className="font-black uppercase tracking-widest text-sm">Peak Performance</h3>
              <p className="text-gray-500 text-sm font-medium">Engineered for uncompromising speed, precision, and durability.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED CATEGORIES */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {categories.map((cat) => (
                <div 
                  key={cat.id} 
                  // Clicking a category navigates to products page with search param
                  onClick={() => navigate(`/products?category=${cat.id}`)} 
                  className="group cursor-pointer relative aspect-square bg-[#F5F5F7] rounded-3xl overflow-hidden flex items-end p-8 border border-gray-100 hover:border-black transition-all"
                >
                  {/* Category Image */}
                  <img 
                    src={cat.imageUrl || 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?q=80&w=500&auto=format&fit=crop'} 
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700 mix-blend-multiply" 
                    alt={cat.name} 
                  />
                  <div className="relative z-10 w-full bg-white/90 backdrop-blur-sm p-4 rounded-xl border border-white/50">
                    <h3 className="text-lg font-black text-black uppercase truncate">{cat.name}</h3>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{cat.productCount || 0} Products</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* NEW ARRIVALS */}
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
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
              {featuredProducts.map((p) => (
                <div 
                  key={p.id} 
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="group cursor-pointer flex flex-col"
                >
                  <div className="aspect-square bg-white rounded-2xl mb-5 flex items-center justify-center p-8 overflow-hidden border border-gray-200 group-hover:border-black transition-colors">
                    <img 
                      src={p.imageUrl || 'https://via.placeholder.com/400?text=Gear'} 
                      className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-700 ease-out" 
                      alt={p.name} 
                    />
                  </div>
                  <div className="flex flex-col flex-1">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.15em] mb-1.5">{p.category}</p>
                    <h3 className="text-base font-bold text-black leading-snug mb-2 pr-4 truncate">{p.name}</h3>
                    <p className="text-lg font-medium text-gray-600 mt-auto">${Number(p.price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;