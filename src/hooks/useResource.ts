// useResource — run an async fetch keyed to `deps`, with a cancelled-guard and
// error capture. A rejected call (e.g. an IPC handler throwing on bad input)
// surfaces as `error` instead of leaving `loading` stuck forever. When `enabled`
// is false the resource stays cleared and no fetch runs.
import { useEffect, useState, type DependencyList } from 'react';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  enabled = true,
): Resource<T> {
  const [state, setState] = useState<Resource<T>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcher().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // The fetch is deliberately keyed on the caller's `deps` (+ `enabled`), not on
    // the inline `fetcher` closure, which is a fresh function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return state;
}
