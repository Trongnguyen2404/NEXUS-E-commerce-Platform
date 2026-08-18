import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmUpApi, useApiWarmup, resetWarmUpForTests, SLOW_AFTER_MS } from './warmup';

const API = import.meta.env.VITE_API_URL as string;

describe('warmUpApi', () => {
  beforeEach(() => {
    resetWarmUpForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('pokes the liveness route, not one that would wake the database', async () => {
    await warmUpApi();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(`${API}/health/live`);
    expect(String(url)).not.toMatch(/\/health$/);
  });

  it('sends no credentials, so it cannot be queued behind a token refresh', async () => {
    await warmUpApi();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.credentials).toBe('omit');
    expect(init?.method).toBe('GET');
  });

  it('pokes once per page load however many callers ask', async () => {
    const first = warmUpApi();
    const second = warmUpApi();

    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('resolves false instead of throwing when the API cannot be reached', async () => {
    resetWarmUpForTests();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    await expect(warmUpApi()).resolves.toBe(false);
  });

  it('treats a non-2xx answer as not warm', async () => {
    resetWarmUpForTests();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);

    await expect(warmUpApi()).resolves.toBe(false);
  });
});

describe('useApiWarmup', () => {
  beforeEach(() => {
    resetWarmUpForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports ready once the API answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const { result } = renderHook(() => useApiWarmup());

    await waitFor(() => expect(result.current).toBe('ready'));
  });

  it('reports failed when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { result } = renderHook(() => useApiWarmup());

    await waitFor(() => expect(result.current).toBe('failed'));
  });

  // The banner must not flash on a warm API, only on a genuinely cold one.
  it('stays quiet until the wait passes the slow threshold', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    const { result } = renderHook(() => useApiWarmup());
    expect(result.current).toBe('warming');

    await act(async () => {
      vi.advanceTimersByTime(SLOW_AFTER_MS - 1);
    });
    expect(result.current).toBe('warming');

    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current).toBe('slow');
  });
});
