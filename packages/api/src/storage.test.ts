import { describe, expect, it } from 'vitest';
import { appRouter } from './router';

describe('storage API contract', () => {
  it('exposes the storage lifecycle procedures', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty('storage.createUploadIntent');
    expect(procedures).toHaveProperty('storage.confirmUpload');
    expect(procedures).toHaveProperty('storage.getDownloadUrl');
    expect(procedures).toHaveProperty('storage.listFiles');
    expect(procedures).toHaveProperty('storage.deleteFile');
  });

  it('rejects unauthenticated upload intent requests', async () => {
    const caller = appRouter.createCaller({ db: {} as any, user: null, sessionId: null, headers: {} });
    await expect(caller.storage.createUploadIntent({ filename: 'photo.png', contentType: 'image/png', size: 1 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
