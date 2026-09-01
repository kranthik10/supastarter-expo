export const installationIdPattern = /^install_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function isValidInstallationId(value: string): boolean {
  return installationIdPattern.test(value);
}

export function createInstallationId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `install_${random}`;
}
