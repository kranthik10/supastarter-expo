export const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()'
};

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*');
}

export function resolveCorsOrigin(origin: string | undefined, allowedOrigins: readonly string[]): string | undefined {
  if (!origin || !allowedOrigins.includes(origin)) return undefined;
  return origin;
}
