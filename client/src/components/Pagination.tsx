import { ChevronLeft, ChevronRight } from 'lucide-react';

// Props for the shared pager.
interface Props {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  /** What is being counted, for the summary line. */
  label?: string;
}

/** Page controls for a list that loads one page at a time. */
const Pagination = ({ page, totalPages, total, onChange, label = 'results' }: Props) => {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1,
  );

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-4 pt-8 mt-8 border-t border-gray-200"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
        Page {page} of {totalPages} · {total} {label}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        {pages.map((n, i) => (
          <span key={n} className="flex items-center">
            {/* A gap in the run means pages were skipped. */}
            {i > 0 && n - pages[i - 1] > 1 && (
              <span className="px-1 text-gray-300 select-none">…</span>
            )}
            <button
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`h-10 w-10 rounded-lg text-sm font-semibold transition-colors ${
                n === page
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:bg-surface-muted hover:text-black'
              }`}
            >
              {n}
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
