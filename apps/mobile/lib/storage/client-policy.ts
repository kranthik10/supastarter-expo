import { ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE_BYTES } from '@repo/storage/policy';

const extensionTypes: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function inferContentType(filename: string, explicitType?: string | null): string | null {
  if (explicitType?.startsWith('image/')) return explicitType;
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  return extensionTypes[extension] ?? null;
}

export function validateAvatarAsset(input: { contentType: string | null; size: number }): { ok: true } | { ok: false; reason: string } {
  if (!input.contentType || !ALLOWED_CONTENT_TYPES.includes(input.contentType as (typeof ALLOWED_CONTENT_TYPES)[number]) || !input.contentType.startsWith('image/')) {
    return { ok: false, reason: 'avatar_must_be_an_image' };
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0) return { ok: false, reason: 'invalid_size' };
  if (input.size > MAX_FILE_SIZE_BYTES) return { ok: false, reason: 'file_too_large' };
  return { ok: true };
}
