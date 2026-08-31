import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './router';
import { createContext } from './context';
import { getAuth } from './auth';

export const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

const auth = getAuth();
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));

app.use(
  '/api/trpc/*',
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext(c),
  })
);

app.all('/webhooks/*', (c) => c.json({ ok: true, provider: c.req.path.split('/')[2] ?? 'unknown' }));

export default app;

export type { AppRouter } from './router';
