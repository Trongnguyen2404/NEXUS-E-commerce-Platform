import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import axiosClient from '../api/axiosClient';

interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  category: string;
}

interface MetaData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const response: any = await axiosClient.get('/products', {  
        params: { search, page, limit: 8 } // Tăng limit lên 12 cho đẹp grid
      });
      setProducts(response.data);
      setMeta(response.meta);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchProducts();
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [search, page]);

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        
        {/* Header & Search */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-black uppercase">Pro Gear</h1>
            <p className="text-gray-500 text-xs font-semibold tracking-[0.2em] mt-3 uppercase">
              Showing {products.length} of {meta?.total || 0} results
            </p>
          </div>

          <div className="relative max-w-sm w-full">
            <input 
              type="text"
              placeholder="Search collection..."
              value={search}
              onChange={(e) => {setSearch(e.target.value); setPage(1);}}
              className="w-full bg-[#F5F5F7] border-none rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-black transition-all outline-none text-black font-medium"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        {isLoading ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-black" size={40} />
          </div>
        ) : (
          <>
            {/* Product Grid - Thiết kế không viền thanh lịch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
              {products.map((p) => (
                <div 
                  key={p.id} 
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="group cursor-pointer flex flex-col"
                >
                  <div className="aspect-square bg-[#F5F5F7] rounded-2xl mb-5 flex items-center justify-center p-8 overflow-hidden">
                    <img 
                      src={p.imageUrl || 'https://via.placeholder.com/400x400?text=Nexus+Gear'} 
                      className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-700 ease-out" 
                      alt={p.name} 
                    />
                  </div>
                  
                  <div className="flex flex-col flex-1">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.15em] mb-1.5">{p.category}</p>
                    <h3 className="text-base font-bold text-black leading-snug mb-2 pr-4">{p.name}</h3>
                    <p className="text-lg font-medium text-gray-600 mt-auto">${p.price}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls - Vuông vức */}
            {meta && meta.totalPages > 1 && (
              <div className="mt-20 flex justify-center items-center gap-2 border-t border-gray-100 pt-10">
                <button 
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                
                <div className="flex gap-1">
                  {[...Array(meta.totalPages)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setPage(i + 1)}
                      className={`h-10 w-10 rounded-lg text-sm font-semibold transition-all ${
                        page === i + 1 
                        ? 'bg-black text-white' 
                        : 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-black'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <button 
                  disabled={page === meta.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Products;