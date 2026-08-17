import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, X } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import StarRating from '../components/StarRating';
import WishlistButton from '../components/WishlistButton';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';
import type { Category, PageResponse, PaginatedResponse, Product } from '../types/api';

type MetaData = PaginatedResponse<Product>['meta'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most reviewed' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name: A–Z' },
  { value: 'name_desc', label: 'Name: Z–A' },
] as const;

const Products = () => {
  const navigate = useNavigate();

  // Filters live in the URL so a filtered view can be shared, bookmarked and
  // survives a refresh or the browser back button.
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

  // The search box needs its own state so typing stays responsive while the
  // request is debounced.
  const [searchInput, setSearchInput] = useState(search);

  /** Writes one or more params, always resetting to page 1 unless paging. */
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

  // Debounce only the text box; the other controls apply immediately.
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
            limit: 8,
            sort,
            // Empty strings would be sent as `?category=`, which the DTO would
            // reject; omit them instead.
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

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="min-h-screen bg-white pb-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-12">

        {/* Header & Search */}
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

        {/* Sort + filter toggle */}
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

          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            aria-label="Sort products"
            className="bg-[#F5F5F7] rounded-xl px-5 py-3 text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-black cursor-pointer"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {(activeFilterCount > 0 || search) && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>

        {showFilters && (
          <div className="bg-[#F5F5F7] rounded-3xl p-8 mb-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <label htmlFor="filter-category" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                Category
              </label>
              <select
                id="filter-category"
                value={category}
                onChange={(e) => updateParams({ category: e.target.value })}
                className="w-full bg-white rounded-xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-black cursor-pointer"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug ?? c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
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
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-black" size={40} />
          </div>
        ) : (
          <>
            {/* Each card is one bounded surface. Previously only the image tile
                had a background and the text sat loose on the page, so the cards
                bled into the white and the grid was tiring to scan. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="group cursor-pointer flex flex-col bg-white border border-gray-200 rounded-3xl overflow-hidden hover:border-gray-400 hover:shadow-lg transition-all"
                >
                  <div className="relative aspect-square bg-surface-muted flex items-center justify-center p-6 overflow-hidden">
                    <img
                      src={p.imageUrl || PRODUCT_PLACEHOLDER}
                      onError={(e) => { e.currentTarget.src = PRODUCT_PLACEHOLDER; }}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out"
                      alt={p.name}
                    />
                    <WishlistButton productId={p.id} className="absolute top-3 right-3" />
                  </div>

                  <div className="flex flex-col flex-1 p-5 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-brand-ink uppercase tracking-[0.15em] mb-1.5">{p.category}</p>
                    <h3 className="text-base font-bold text-black leading-snug mb-2">{p.name}</h3>

                    {p.reviewCount > 0 && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <StarRating value={p.rating} size={12} />
                        <span className="text-[10px] font-bold text-gray-400">({p.reviewCount})</span>
                      </div>
                    )}

                    <p className="text-lg font-black text-black mt-auto pt-2">${Number(p.price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls - Vuông vức */}
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