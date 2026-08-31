import { serve } from '@hono/node-server';
import { app } from './server';

const port = Number(process.env.PORT ?? 3000);
console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
