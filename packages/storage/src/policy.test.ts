import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  buildObjectKey,
  canReserveStorage,
  storageLimitBytes,
  sanitizeFilename,
  validateUploadMetadata,
  canConfirmFile,
} from './policy';

describe('storage upload policy', () => {
  it('accepts the supported MIME types and rejects others', () => {
    for (const contentType of ALLOWED_CONTENT_TYPES) {
      expect(validateUploadMetadata({ contentType, size: 1 })).toEqual({ ok: true });
    }
    expect(validateUploadMetadata({ contentType: 'application/zip', size: 1 })).toEqual({ ok: false, reason: 'invalid_content_type' });
  });

  it('enforces positive size and the 10 MiB boundary', () => {
    expect(validateUploadMetadata({ contentType: 'image/png', size: 0 })).toEqual({ ok: false, reason: 'invalid_size' });
    expect(validateUploadMetadata({ contentType: 'image/png', size: MAX_FILE_SIZE_BYTES })).toEqual({ ok: true });
    expect(validateUploadMetadata({ contentType: 'image/png', size: MAX_FILE_SIZE_BYTES + 1 })).toEqual({ ok: false, reason: 'file_too_large' });
    expect(validateUploadMetadata({ contentType: 'image/png', size: 1.5 })).toEqual({ ok: false, reason: 'invalid_size' });
  });

  it('sanitizes traversal, separators, and control characters', () => {
    expect(sanitizeFilename('../../avatar\u0000.png')).toBe('avatar.png');
    expect(sanitizeFilename('folder\\nested report?.pdf')).toBe('nested-report-.pdf');
    expect(sanitizeFilename('..')).toBe('file');
  });

  it('generates server-namespaced organization and private keys', () => {
    expect(buildObjectKey({ scope: 'org', organizationId: 'org_1', userId: 'user_1', fileId: 'file_1', filename: '../report.pdf' })).toBe(
      'org/org_1/user_1/file_1-report.pdf'
    );
    expect(buildObjectKey({ scope: 'user', userId: 'user_1', fileId: 'file_2', filename: 'avatar.png', purpose: 'avatar' })).toBe(
      'user/user_1/avatar/file_2-avatar.png'
    );
  });
});

describe('storage quota and lifecycle policy', () => {
  it('converts GiB entitlements and supports unlimited storage', () => {
    expect(storageLimitBytes(1)).toBe(1024 * 1024 * 1024);
    expect(storageLimitBytes(null)).toBeNull();
  });

  it('counts ready and pending reservations before accepting a request', () => {
    expect(canReserveStorage({ limitBytes: 100, readyBytes: 40, pendingBytes: 50, requestedBytes: 10 })).toEqual({ ok: true });
    expect(canReserveStorage({ limitBytes: 100, readyBytes: 40, pendingBytes: 50, requestedBytes: 11 })).toEqual({ ok: false, reason: 'storage_limit_reached' });
    expect(canReserveStorage({ limitBytes: null, readyBytes: 9_000, pendingBytes: 9_000, requestedBytes: 9_000 })).toEqual({ ok: true });
  });

  it('allows only unexpired pending files to be confirmed', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    expect(canConfirmFile('pending', new Date('2026-09-01T12:05:00.000Z'), now)).toEqual({ ok: true });
    expect(canConfirmFile('pending', new Date('2026-09-01T11:59:00.000Z'), now)).toEqual({ ok: false, reason: 'upload_expired' });
    expect(canConfirmFile('ready', new Date('2026-09-01T12:05:00.000Z'), now)).toEqual({ ok: false, reason: 'file_not_pending' });
    expect(canConfirmFile('deleted', null, now)).toEqual({ ok: false, reason: 'file_not_pending' });
  });
});
