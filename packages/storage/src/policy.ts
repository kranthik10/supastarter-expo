export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const UPLOAD_URL_EXPIRY_SECONDS = 10 * 60;
export const DOWNLOAD_URL_EXPIRY_SECONDS = 5 * 60;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
export type FileScope = 'org' | 'user';
export type FilePurpose = 'avatar';
export type FileStatus = 'pending' | 'ready' | 'deleted';

export type UploadMetadata = {
  contentType: string;
  size: number;
};

export type UploadMetadataError = 'invalid_content_type' | 'invalid_size' | 'file_too_large';

export function validateUploadMetadata(input: UploadMetadata): { ok: true } | { ok: false; reason: UploadMetadataError } {
  if (!ALLOWED_CONTENT_TYPES.includes(input.contentType as AllowedContentType)) {
    return { ok: false, reason: 'invalid_content_type' };
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    return { ok: false, reason: 'invalid_size' };
  }
  if (input.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: 'file_too_large' };
  }
  return { ok: true };
}

export function sanitizeFilename(filename: string): string {
  const leaf = filename.trim().split(/[\\/]/).pop() ?? '';
  const sanitized = leaf
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+/, '')
    .slice(0, 120);
  return sanitized || 'file';
}

export function buildObjectKey(input: {
  scope: FileScope;
  organizationId?: string;
  userId: string;
  fileId: string;
  filename: string;
  purpose?: FilePurpose;
}): string {
  const safeName = sanitizeFilename(input.filename);
  const purposePrefix = input.purpose ? `${input.purpose}/` : '';
  if (input.scope === 'org') {
    if (!input.organizationId) throw new Error('organization_id_required');
    return `org/${input.organizationId}/${input.userId}/${purposePrefix}${input.fileId}-${safeName}`;
  }
  return `user/${input.userId}/${purposePrefix}${input.fileId}-${safeName}`;
}

export function storageLimitBytes(gigabytes: number | null): number | null {
  return gigabytes === null ? null : gigabytes * 1024 * 1024 * 1024;
}

export function canReserveStorage(input: {
  limitBytes: number | null;
  readyBytes: number;
  pendingBytes: number;
  requestedBytes: number;
}): { ok: true } | { ok: false; reason: 'storage_limit_reached' } {
  if (input.limitBytes === null) return { ok: true };
  return input.readyBytes + input.pendingBytes + input.requestedBytes <= input.limitBytes
    ? { ok: true }
    : { ok: false, reason: 'storage_limit_reached' };
}

export function canConfirmFile(status: FileStatus, expiresAt: Date | null, now: Date): { ok: true } | { ok: false; reason: 'upload_expired' | 'file_not_pending' } {
  if (status !== 'pending') return { ok: false, reason: 'file_not_pending' };
  if (expiresAt && expiresAt <= now) return { ok: false, reason: 'upload_expired' };
  return { ok: true };
}
