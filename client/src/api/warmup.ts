import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

// How long the API may stay silent before we admit to the shopper that it is
// waking up. Under this, a spinner is honest enough and a banner is just noise.
export const SLOW_AFTER_MS = 2500;

let inFlight: Promise<boolean> | null = null;

// Pokes the API so a sleeping instance starts spinning up while the shopper is
// still reading the page.
//
// Deliberately plain fetch, not axiosClient: this must not carry credentials,
// must not be queued behind the 401-refresh interceptor, and must not be
// retried. It targets the liveness route, which does not touch the database —
// waking the web service is the goal, waking Postgres is not.
export const warmUpApi = (): Promise<boolean> => {
  if (inFlight) return inFlight;
  if (!API_URL) return Promise.resolve(true);

  inFlight = fetch(`${API_URL}/health/live`, {
    method: 'GET',
    cache: 'no-store',
    // No cookies: the point is a cheap unauthenticated poke.
    credentials: 'omit',
  })
    .then((response) => response.ok)
    .catch(() => false);

  return inFlight;
};

// Test seam — the module-level promise would otherwise leak between cases.
export const resetWarmUpForTests = () => {
  inFlight = null;
};

export type WarmupState = 'warming' | 'slow' | 'ready' | 'failed';

// Tracks the warm-up so the UI can explain a long first load instead of just
// spinning. A cold web service takes about a minute to answer.
export const useApiWarmup = (): WarmupState => {
  const [state, setState] = useState<WarmupState>('warming');

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!cancelled) setState((current) => (current === 'warming' ? 'slow' : current));
    }, SLOW_AFTER_MS);

    void warmUpApi().then((ok) => {
      if (cancelled) return;
      clearTimeout(timer);
      setState(ok ? 'ready' : 'failed');
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return state;
};
