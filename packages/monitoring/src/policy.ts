import { screenNameForPath, type ScreenName } from '@repo/analytics/policy';

export type MonitoringScalar = string | number | boolean;
export type MonitoringValue = MonitoringScalar | MonitoringValue[] | { [key: string]: MonitoringValue };
export type MonitoringContext = Record<string, MonitoringValue>;

export type MonitoringError = {
  name: string;
  message: string;
  stack?: string;
};

export const monitoringEnvironments = ['development', 'preview', 'production', 'test'] as const;
export type MonitoringEnvironment = (typeof monitoringEnvironments)[number];
export type MonitoringLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

const expectedErrorCodes = new Set([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'TOO_MANY_REQUESTS',
  'UNPROCESSABLE_CONTENT',
  'METHOD_NOT_SUPPORTED',
]);

const forbiddenKeys = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'session',
  'sessionid',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'databaseurl',
  'presignedurl',
  'uploadurl',
  'downloadurl',
  'invitationtoken',
  'passwordresettoken',
  'pushToken'.toLowerCase(),
  'requestbody',
  'rawbody',
  'responsebody',
  'payment',
  'cardnumber',
  'cvv',
  'providersecret',
  'email',
  'name',
  'phone',
  'address',
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|access_token|refresh_token|signature|sig|key|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(\/(?:invite|reset-password|verify-email)\/)[^/?\s]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[REDACTED]')
    .slice(0, 512);
}

function sanitizeValue(value: unknown, depth: number): MonitoringValue {
  if (depth > 4) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : '[REDACTED]';
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === 'object' && value !== null) {
    const output: Record<string, MonitoringValue> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      output[key] = forbiddenKeys.has(normalizeKey(key)) ? '[REDACTED]' : sanitizeValue(raw, depth + 1);
    }
    return output;
  }
  return '[REDACTED]';
}

export function sanitizeMonitoringContext(value: unknown): MonitoringContext {
  const sanitized = sanitizeValue(value, 0);
  return typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : {};
}

export function sanitizeMonitoringError(error: unknown): MonitoringError {
  if (error instanceof Error) {
    const result: MonitoringError = { name: redactString(error.name), message: redactString(error.message) };
    if (error.stack) result.stack = redactString(error.stack);
    return result;
  }
  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>;
    const result: MonitoringError = {
      name: redactString(typeof value.name === 'string' ? value.name : 'Error'),
      message: redactString(typeof value.message === 'string' ? value.message : 'Unknown error'),
    };
    if (typeof value.stack === 'string') result.stack = redactString(value.stack);
    return result;
  }
  return { name: 'Error', message: redactString(String(error)) };
}

export function isExpectedMonitoringErrorCode(code: string | undefined): boolean {
  return code !== undefined && expectedErrorCodes.has(code);
}

export function isMonitoringEnvironment(value: string): value is MonitoringEnvironment {
  return (monitoringEnvironments as readonly string[]).includes(value);
}

export function sanitizeMonitoringRoute(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const path = value.split(/[?#]/, 1)[0] ?? '';
  if (!path) return undefined;
  if (path.startsWith('/api/trpc/')) return path.slice(0, 256);
  return screenNameForPath(path) as ScreenName;
}

export type ServerRequestContextInput = {
  code?: string;
  method?: string;
  route?: string;
  procedure?: string;
  status?: number;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
};

export function sanitizeServerRequestContext(input: unknown): MonitoringContext {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const value = input as ServerRequestContextInput;
  const output: MonitoringContext = {};
  if (typeof value.code === 'string' && /^[A-Z_]{3,64}$/.test(value.code)) output.code = value.code;
  if (typeof value.method === 'string' && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(value.method)) output.method = value.method;
  const route = sanitizeMonitoringRoute(value.route);
  if (route) output.route = route;
  if (typeof value.procedure === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value.procedure)) output.procedure = value.procedure;
  if (typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) output.status = value.status;
  if (typeof value.requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId)) output.request_id = value.requestId;
  if (typeof value.userId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.userId)) output.user_id = value.userId;
  if (typeof value.organizationId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.organizationId)) output.organization_id = value.organizationId;
  return output;
}
