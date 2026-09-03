export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';

/** Status → i18n label key + badge tone. Status is never color-only. */
export const BOOKING_STATUS_META: Record<BookingStatus, { labelKey: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  pending: { labelKey: 'marketplace.status.pending', tone: 'neutral' },
  confirmed: { labelKey: 'marketplace.status.confirmed', tone: 'info' },
  in_progress: { labelKey: 'marketplace.status.in_progress', tone: 'info' },
  completed: { labelKey: 'marketplace.status.completed', tone: 'success' },
  cancelled: { labelKey: 'marketplace.status.cancelled', tone: 'danger' },
  rejected: { labelKey: 'marketplace.status.rejected', tone: 'danger' },
};

const WEEKDAY_MINUTES = 1440;

export function formatMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(WEEKDAY_MINUTES, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function weekdayNames(template: string): string[] {
  return template.split(' ');
}
