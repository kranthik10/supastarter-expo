import { afterEach, describe, expect, it } from 'vitest';
import {
  NotConfiguredStorageProvider,
  createStorageConfiguration,
  getStorageProvider,
  resetStorageProviderForTests,
  setStorageProviderForTests,
  type StorageProvider,
} from './server';

afterEach(() => resetStorageProviderForTests());

describe('storage provider configuration', () => {
  it('returns no configuration when credentials are incomplete', () => {
    expect(createStorageConfiguration({ R2_BUCKET: 'files' })).toBeNull();
    expect(createStorageConfiguration({ S3_BUCKET: 'files', S3_ENDPOINT: 'https://s3.example.com' })).toBeNull();
  });

  it('recognizes complete R2 and S3-compatible server configuration without exposing secrets', () => {
    const r2 = createStorageConfiguration({
      R2_ACCOUNT_ID: 'account-for-test',
      R2_ACCESS_KEY_ID: 'access-key-for-test',
      R2_SECRET_ACCESS_KEY: 'secret-key-for-test',
      R2_BUCKET: 'files',
    });
    expect(r2?.provider).toBe('r2');
    expect(r2?.bucket).toBe('files');
    expect(r2).not.toHaveProperty('secret');

    const s3 = createStorageConfiguration({
      S3_ENDPOINT: 'https://s3.example.com',
      S3_ACCESS_KEY_ID: 'access-key-for-test',
      S3_SECRET_ACCESS_KEY: 'secret-key-for-test',
      S3_BUCKET: 'files',
    });
    expect(s3?.provider).toBe('s3');
  });

  it('returns a stable not-configured provider when no provider is available', async () => {
    const provider = getStorageProvider({});
    expect(provider).toBeInstanceOf(NotConfiguredStorageProvider);
    await expect(provider.createPresignedUpload({ key: 'user/u/file', contentType: 'image/png', expiresInSeconds: 600 })).rejects.toMatchObject({
      code: 'STORAGE_NOT_CONFIGURED',
    });
  });

  it('supports an injectable provider seam for API tests', async () => {
    const fake: StorageProvider = {
      configured: true,
      createPresignedUpload: async () => ({ uploadUrl: 'https://upload.example.com', expiresAt: new Date('2026-09-01T12:10:00Z'), headers: {} }),
      headObject: async () => ({ exists: true, size: 1, contentType: 'image/png' }),
      deleteObject: async () => {},
      createPresignedDownload: async () => ({ downloadUrl: 'https://download.example.com', expiresAt: new Date('2026-09-01T12:10:00Z') }),
    };
    setStorageProviderForTests(fake);
    expect(getStorageProvider({})).toBe(fake);
    await expect(getStorageProvider({}).headObject({ key: 'file' })).resolves.toEqual({ exists: true, size: 1, contentType: 'image/png' });
  });
});
