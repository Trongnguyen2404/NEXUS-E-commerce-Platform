import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import Select from '../components/Select';
import ProductCard from '../components/ProductCard';
import { pickNewArrivals } from '../components/newArrivals';
import useQuickAdd from '../hooks/useQuickAdd';
import type { Category, PageResponse, PaginatedResponse, Product } from '../types/api';
import useDocumentMeta from '../hooks/useDocumentMeta';

// Paging metadata for the product listing.
type MetaData = PaginatedResponse<Product>['meta'];


const PAGE_SIZE = 8;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most reviewed' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name: A–Z' },
  { value: 'name_desc', label: 'Name: Z–A' },
] as const;

// Product listing with search, filters, sorting and paging.
const Products = () => {
  useDocumentMeta({ title: 'Pro Gear', description: 'Browse the full NEXUS catalogue — audio, accessories, displays and desk gear. Filter by price, availability and rating.' });
  const { quickAdd, addingId } = useQuickAdd();

  // Every filter lives in the URL so a filtered grid stays shareable.
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const sort = searchParams.get('sort') ?? 'newest';
  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const inStock = searchParams.get('inStock') === 'true';
  const page = Number(searchParams.get('page') ?? 1);

  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  
  
  const [searchInput, setSearchInput] = useState(search);

  
  const updateParams = useCallback(
    (changes: Record<string, string | null>, keepPage = false) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          if (!keepPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const activeFilterCount =
    (category ? 1 : 0) + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0) + (inStock ? 1 : 0);

  const newArrivals = useMemo(() => pickNewArrivals(products), [products]);

  
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => updateParams({ search: searchInput }), 500);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  useEffect(() => {
    axiosClient
      .get<PageResponse<Category>>('/categories')
      .then((res) => setCategories(res.data ?? []))
      .catch((error) => console.error('Failed to load categories:', error));
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const response = await axiosClient.get<PaginatedResponse<Product>>('/products', {
          params: {
            page,
            limit: PAGE_SIZE,
            sort,
            
            
            ...(search ? { search } : {}),
            ...(category ? { category } : {}),
            ...(minPrice ? { minPrice } : {}),
            ...(maxPrice ? { maxPrice } : {}),
            ...(inStock ? { inStock: true } : {}),
          },
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

    fetchProducts();
  }, [search, category, sort, minPrice, maxPrice, inStock, page]);

  return (
    <div className="min-h-screen bg-white pb-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-12">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-8">
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-[#F5F5F7] border-none rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-black transition-all outline-none text-black font-medium"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-black text-white'
                : 'bg-[#F5F5F7] text-black hover:bg-gray-200'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-white text-black h-5 w-5 rounded-full flex items-center justify-center text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </button>

          <Select
            value={sort}
            onChange={(next) => updateParams({ sort: next })}
            options={SORT_OPTIONS}
            ariaLabel="Sort products"
            className="inline-flex items-center justify-between gap-3 bg-surface-muted hover:bg-surface-sunken rounded-xl px-5 py-3 text-[11px] font-black uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-black cursor-pointer transition-colors"
          />

        </div>

        {showFilters && (
          <div className="bg-[#F5F5F7] rounded-3xl p-8 mb-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <label htmlFor="filter-category" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                Category
              </label>
              <Select
                id="filter-category"
                value={category}
                onChange={(next) => updateParams({ category: next })}
                options={[
                  { value: '', label: 'All categories' },
                  ...categories.map((c) => ({ value: c.slug ?? c.name, label: c.name })),
                ]}
                className="w-full inline-flex items-center justify-between gap-3 bg-white hover:bg-surface-muted rounded-xl px-4 py-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-black cursor-pointer transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                Price range
                {meta?.priceRange && meta.priceRange.max > 0 && (
                  <span className="text-gray-400 normal-case tracking-normal font-medium">
                    {' '}(${meta.priceRange.min.toFixed(0)}–${meta.priceRange.max.toFixed(0)})
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => updateParams({ minPrice: e.target.value })}
                  className="w-full bg-white rounded-xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-black"
                />
                <span className="text-gray-400 font-bold">–</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => updateParams({ maxPrice: e.target.value })}
                  className="w-full bg-white rounded-xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                Availability
              </span>
              <label className="flex items-center gap-3 bg-white rounded-xl px-4 py-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e) => updateParams({ inStock: e.target.checked ? 'true' : null })}
                  className="h-4 w-4 rounded accent-black cursor-pointer"
                />
                <span className="text-sm font-medium">In stock only</span>
              </label>
            </div>
          </div>
        )}

        {isLoading ? (
          
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            aria-busy="true"
            aria-label="Loading products"
          >
            {Array.from({ length: PAGE_SIZE }, (_, i) => (
              <div
                key={i}
                className="flex flex-col bg-white border border-gray-200 rounded-3xl overflow-hidden animate-pulse motion-reduce:animate-none"
              >
                <div className="aspect-square bg-surface-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-2.5 w-16 bg-surface-sunken rounded" />
                  <div className="h-3.5 w-3/4 bg-surface-sunken rounded" />
                  <div className="h-4 w-20 bg-surface-sunken rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          
          <div className="py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mx-auto mb-6">
              <Search size={26} className="text-gray-300" aria-hidden />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3">
              Nothing matched
            </h2>
            <p className="text-sm font-medium text-gray-500 max-w-md mx-auto mb-8">
              {search
                ? <>No products match &ldquo;{search}&rdquo;{activeFilterCount > 0 && ' with the filters you have on'}.</>
                : 'No products match the filters you have on.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                updateParams({ search: null, category: null, minPrice: null, maxPrice: null, inStock: null });
              }}
              className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-colors"
            >
              Show everything
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onQuickAdd={quickAdd}
                  isAdding={addingId === p.id}
                  isNew={newArrivals.has(p.id)}
                />
              ))}
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="mt-12 flex justify-center items-center gap-2 border-t border-gray-100 pt-8">
                <button
                  disabled={page === 1}
                  onClick={() => updateParams({ page: String(page - 1) }, true)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="flex gap-1">
                  {[...Array(meta.totalPages)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => updateParams({ page: String(i + 1) }, true)}
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
                  onClick={() => updateParams({ page: String(page + 1) }, true)}
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