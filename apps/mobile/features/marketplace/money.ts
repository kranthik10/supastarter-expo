/** Money in integer minor units — never floats. Server is price authority. */
export function formatMinor(priceMinor: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(priceMinor / 100);
  } catch {
    return `${(priceMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDuration(minutes: number, template: (count: number) => string): string {
  return template(minutes);
}
