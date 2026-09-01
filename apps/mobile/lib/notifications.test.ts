import { describe, expect, it } from 'vitest';
import { createInstallationId, isValidInstallationId } from './notifications-policy';

describe('mobile notification installation identity', () => {
  it('creates a stable-format opaque installation id', () => {
    const id = createInstallationId();
    expect(isValidInstallationId(id)).toBe(true);
    expect(id.startsWith('install_')).toBe(true);
  });

  it('rejects values that could be used as arbitrary device identifiers', () => {
    expect(isValidInstallationId('')).toBe(false);
    expect(isValidInstallationId('short')).toBe(false);
    expect(isValidInstallationId('install_abc<script>')).toBe(false);
  });
});
