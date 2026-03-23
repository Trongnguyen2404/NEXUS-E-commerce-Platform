import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import axiosClient from '../api/axiosClient';

const Categories = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response: any = await axiosClient.get('/categories');
        setCategories(response.data || []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategories();
  }, []);

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16">
        
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <h1 className="text-5xl font-black tracking-tighter text-black uppercase mb-4">Collections</h1>
          <p className="text-gray-500 text-base font-medium">
            Explore our meticulously curated categories to find exactly what your setup needs.
          </p>
        </div>

        {categories.length === 0 ? (
          <div className="text-center text-gray-500 font-medium">No collections found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {categories.map((cat) => (
              <div 
                key={cat.id} 
                onClick={() => navigate(`/products?category=${cat.slug || cat.name}`)}
                className="group cursor-pointer relative h-[400px] bg-[#F5F5F7] rounded-3xl overflow-hidden border border-gray-100 hover:border-black transition-all flex flex-col justify-end p-10"
              >
                {/* Background Image */}
                <img 
                  src={cat.imageUrl || 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?q=80&w=1000&auto=format&fit=crop'} 
                  className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-50 group-hover:scale-105 transition-transform duration-700 ease-out" 
                  alt={cat.name} 
                />
                
                {/* Content */}
                <div className="relative z-10 flex justify-between items-end w-full">
                  <div>
                    <h2 className="text-3xl font-black text-black uppercase tracking-tight">{cat.name}</h2>
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mt-2">
                      {cat.productCount || 0} Items
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors shadow-sm">
                    <ArrowRight size={20} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default Categories;