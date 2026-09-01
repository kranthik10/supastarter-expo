import { describe, expect, it } from 'vitest';
import { inferContentType, validateAvatarAsset } from './client-policy';

describe('mobile storage asset policy', () => {
  it('uses an explicit MIME type and safe filename fallback', () => {
    expect(inferContentType('photo.PNG', undefined)).toBe('image/png');
    expect(inferContentType('photo.jpg', 'image/jpeg')).toBe('image/jpeg');
    expect(inferContentType('photo.bin', undefined)).toBeNull();
  });

  it('accepts only bounded supported avatar images', () => {
    expect(validateAvatarAsset({ contentType: 'image/png', size: 1 })).toEqual({ ok: true });
    expect(validateAvatarAsset({ contentType: 'application/pdf', size: 1 })).toEqual({ ok: false, reason: 'avatar_must_be_an_image' });
    expect(validateAvatarAsset({ contentType: 'image/png', size: 0 })).toEqual({ ok: false, reason: 'invalid_size' });
  });
});
