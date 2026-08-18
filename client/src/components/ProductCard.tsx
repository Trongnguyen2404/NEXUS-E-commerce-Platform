import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import StarRating from './StarRating';
import WishlistButton from './WishlistButton';
import { PRODUCT_PLACEHOLDER } from './productPlaceholder';
import type { Product } from '../types/api';

// Props for the product tile.
interface Props {
  product: Product;
  onQuickAdd?: (product: Product) => void;
  isAdding?: boolean;
  // Decided by the list via pickNewArrivals, because a tile on its own cannot
  // tell a genuine new arrival from a catalogue that was all seeded at once.
  isNew?: boolean;
}

const LOW_STOCK_AT = 5;

// The single product tile used by the home, listing and wishlist grids.
const ProductCard = ({ product, onQuickAdd, isAdding = false, isNew = false }: Props) => {
  const soldOut = !product.hasVariants && product.stock <= 0;
  const lowStock = !soldOut && !product.hasVariants && product.stock <= LOW_STOCK_AT;
  const canQuickAdd = Boolean(onQuickAdd) && !soldOut && !product.hasVariants;

  return (
    <Link
      to={`/products/${product.id}`}
      className="group relative flex flex-col bg-white border border-gray-200 rounded-3xl overflow-hidden hover:border-black hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)] hover:-translate-y-1 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
    >
      {/* Every tile crops to the same square so the grid never goes ragged. */}
      <div className="relative aspect-square bg-surface-muted overflow-hidden">
        <img
          src={product.imageUrl || PRODUCT_PLACEHOLDER}
          onError={(e) => {
            e.currentTarget.src = PRODUCT_PLACEHOLDER;
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] ${
            soldOut ? 'opacity-40' : ''
          }`}
          alt={product.name}
          loading="lazy"
        />

        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {soldOut && (
            <span className="bg-black text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              Sold out
            </span>
          )}
          {!soldOut && isNew && (
            <span className="bg-brand text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              New
            </span>
          )}
          {lowStock && (
            <span className="bg-state-warning-soft text-state-warning text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              Only {product.stock} left
            </span>
          )}
        </div>

        <WishlistButton productId={product.id} className="absolute top-3 right-3 z-10" />

        {canQuickAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAdd?.(product);
            }}
            disabled={isAdding}
            className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 bg-black/90 backdrop-blur text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 transition-all duration-300 hover:bg-black disabled:opacity-60 motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0"
          >
            <ShoppingBag size={13} />
            {isAdding ? 'Adding…' : 'Quick add'}
          </button>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5 border-t border-gray-100">
        <p className="text-[10px] font-bold text-brand-ink uppercase tracking-[0.15em] mb-1.5">
          {product.category ?? 'Nexus'}
        </p>
        <h3 className="text-base font-bold text-black leading-snug mb-2 line-clamp-2 min-h-[2.75rem]">
          {product.name}
        </h3>

        {/* Reserve the rating row even with no reviews, or card heights jump. */}
        <div className="flex items-center gap-1.5 h-4 mb-2">
          {product.reviewCount > 0 && (
            <>
              <StarRating value={product.rating} size={12} />
              <span className="text-[10px] font-bold text-gray-400">({product.reviewCount})</span>
            </>
          )}
        </div>

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <p className="text-lg font-black text-black">${Number(product.price).toFixed(2)}</p>
          {product.hasVariants && (
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Options
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
