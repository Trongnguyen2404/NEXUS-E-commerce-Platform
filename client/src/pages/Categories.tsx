import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import CategoryArt from '../components/CategoryArt';
import type { Category, PageResponse } from '../types/api';
import useDocumentMeta from '../hooks/useDocumentMeta';

// Collections page listing every category.
const Categories = () => {
  useDocumentMeta({ title: 'Collections', description: 'Shop NEXUS by collection — audio, accessories and smart workspace gear.' });
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axiosClient.get<PageResponse<Category>>('/categories');
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
    <div className="min-h-screen bg-white pb-16">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/products?category=${cat.slug || cat.name}`)}
                className="group relative h-[420px] bg-black rounded-3xl overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                <CategoryArt category={cat} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-9">
                  {cat.description && (
                    <p className="text-[13px] font-medium text-white/70 leading-relaxed mb-4 line-clamp-2">
                      {cat.description}
                    </p>
                  )}
                  <div className="flex justify-between items-end w-full gap-4">
                    <div className="min-w-0">
                      <h2 className="text-3xl font-black text-white uppercase tracking-tight leading-tight">
                        {cat.name}
                      </h2>
                      <p className="text-xs font-bold text-white/60 uppercase tracking-widest mt-2">
                        {cat.productCount ?? 0} {cat.productCount === 1 ? 'Item' : 'Items'}
                      </p>
                    </div>
                    <span className="w-12 h-12 shrink-0 rounded-full bg-white text-black flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors">
                      <ArrowRight size={20} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-20 rounded-3xl bg-surface-muted px-8 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-3">
            Not sure where to start?
          </h2>
          <p className="text-gray-500 font-medium max-w-md mx-auto mb-8">
            Browse the full catalogue and narrow it down by price, availability and rating.
          </p>
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-colors"
          >
            <span>Shop all gear</span>
            <ArrowRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
};

export default Categories;