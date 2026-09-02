import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './router';
import { createContext } from './context';
import { getAuth } from './auth';
import { captureServerException, getServerMonitoring } from '@repo/monitoring/server';

export const app = new Hono();
const serverMonitoring = getServerMonitoring();

app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500;
  const rawCode = (error as { code?: unknown }).code;
  const code = typeof rawCode === 'string' ? rawCode : status >= 400 && status < 500 ? 'BAD_REQUEST' : undefined;
  captureServerException(serverMonitoring, error, {
    code,
    method: c.req.method,
    route: c.req.path,
    status,
    requestId: c.req.header('x-request-id'),
  });
  if (error instanceof HTTPException) return error.getResponse();
  return c.json({ error: 'internal_server_error' }, 500);
});

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
