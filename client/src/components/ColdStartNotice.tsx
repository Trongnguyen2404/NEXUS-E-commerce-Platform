import { Loader2 } from 'lucide-react';
import { useApiWarmup } from '../api/warmup';

// Explains a slow first load instead of leaving the shopper with a spinner.
//
// The API runs on an instance that sleeps when nobody has called it, and takes
// about a minute to come back. That minute looks identical to a broken site
// unless something says otherwise.
const ColdStartNotice = () => {
  const state = useApiWarmup();

  if (state !== 'slow') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-brand-soft border-b border-brand/20"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2.5">
        <Loader2 size={14} className="animate-spin text-brand-ink shrink-0" aria-hidden />
        <p className="text-[12px] font-semibold text-brand-ink">
          Waking the store up — the first load after a quiet spell takes about a minute.
        </p>
      </div>
    </div>
  );
};

export default ColdStartNotice;
