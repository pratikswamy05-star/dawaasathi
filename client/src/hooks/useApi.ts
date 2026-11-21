import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { idbGet, idbSet } from '../lib/idb';

interface Options {
  /** Re-fetch every N ms. */
  poll?: number;
  /** Cache successful responses in IndexedDB and fall back to them when offline. */
  cacheKey?: string;
  skip?: boolean;
}

/** GET with loading / error / stale (offline cache) states. */
export function useApi<T>(path: string | null, opts: Options = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [stale, setStale] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (quiet = false) => {
      if (!path || opts.skip) return;
      if (!quiet) setLoading(true);
      try {
        const d = await api<T>(path);
        if (!mounted.current) return;
        setData(d);
        setError(null);
        setStale(false);
        if (opts.cacheKey) void idbSet('cache', opts.cacheKey, d).catch(() => undefined);
      } catch (e) {
        if (!mounted.current) return;
        const err = e instanceof ApiError ? e : new ApiError('Something went wrong', 500);
        if (err.offline && opts.cacheKey) {
          const cached = await idbGet<T>('cache', opts.cacheKey).catch(() => undefined);
          if (cached) {
            setData(cached);
            setStale(true);
            setError(null);
            return;
          }
        }
        setError(err);
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [path, opts.cacheKey, opts.skip],
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    const onSync = () => void load(true);
    window.addEventListener('data-synced', onSync);
    const id = opts.poll ? setInterval(() => void load(true), opts.poll) : undefined;
    return () => {
      mounted.current = false;
      window.removeEventListener('data-synced', onSync);
      if (id) clearInterval(id);
    };
  }, [load, opts.poll]);

  return { data, setData, error, loading, stale, reload: () => load(true) };
}
