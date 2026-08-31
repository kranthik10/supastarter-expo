import React from 'react';
import { api, ApiError } from './client';

type QueryState<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  refetch: () => void;
};

export function useQuery<T>(path: string | null): QueryState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<ApiError | Error | null>(null);
  const [loading, setLoading] = React.useState(!!path);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return { data, error, loading, refetch: () => setNonce((n) => n + 1) };
}

export function useMutation<TBody, TResult>(
  mutateFn: (body: TBody) => Promise<TResult>
) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<ApiError | Error | null>(null);

  const mutate = React.useCallback(
    async (body: TBody): Promise<TResult | null> => {
      setLoading(true);
      setError(null);
      try {
        return await mutateFn(body);
      } catch (e) {
        setError(e as Error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [mutateFn]
  );

  return { mutate, loading, error };
}
