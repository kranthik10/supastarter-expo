import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './router';
import { config } from '@repo/config';
import { getAuthToken } from './client';

export function createTRPC() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${config.apiUrl}/api/trpc`,
        transformer: superjson,
        fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
        headers: async () => {
          const token = await getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export const trpc = createTRPC();
