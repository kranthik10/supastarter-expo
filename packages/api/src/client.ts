import { config } from '@repo/config';
import * as SecureStore from 'expo-secure-store';
const secureStorage = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  remove: (k: string) => SecureStore.deleteItemAsync(k),
};

const TOKEN_KEY = 'auth.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string
  ) {
    super(message ?? `API error ${status}`);
    this.name = 'ApiError';
  }
}

export async function getAuthToken(): Promise<string | null> {
  return secureStorage.get(TOKEN_KEY);
}

export async function setAuthToken(token: string | null): Promise<void> {
  if (token) await secureStorage.set(TOKEN_KEY, token);
  else await secureStorage.remove(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<T> {
  const { body, headers, ...rest } = options;
  const token = await getAuthToken();

  const res = await fetch(`${config.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    signal: rest.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) throw new ApiError(res.status, data);

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
