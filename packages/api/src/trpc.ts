import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './router';
import { config } from '@repo/config';
import { getAuthToken } from './client';
import { createSessionAwareFetch, type UnauthorizedContext } from './transport-policy';

export type { UnauthorizedContext } from './transport-policy';

let unauthorizedHandler: ((context: UnauthorizedContext) => void | Promise<void>) | null = null;

export function setTRPCUnauthorizedHandler(
  handler: ((context: UnauthorizedContext) => void | Promise<void>) | null
): void {
  unauthorizedHandler = handler;
}

export function createTRPC() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${config.apiUrl}/api/trpc`,
        transformer: superjson,
        fetch: createSessionAwareFetch(
          (input, init) => fetch(input, { ...init, credentials: 'include' }),
          (context) => unauthorizedHandler?.(context)
        ),
        headers: async () => {
          const token = await getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export const trpc = createTRPC();
