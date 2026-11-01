import { AppBadRequestException, ErrorCode } from '../common/exceptions';

/** Laengster Zeitraum, der auf einmal erfasst werden kann (Tage). */
export const MAX_ABSENCE_RANGE_DAYS = 366;

const toUtcDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Kalendertage von `from` bis `to` (inkl.) als "YYYY-MM-DD". Bei einem
 * Zeitraum ueber mehrere Tage werden Samstag/Sonntag uebersprungen (z.B.
 * Militaerdienst Mo-Fr ueber mehrere Wochen); ein einzelner Tag zaehlt immer.
 */
export function absenceDates(from: string, to?: string): string[] {
  const start = toUtcDate(from);
  const end = toUtcDate(to ?? from);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (Number.isNaN(days) || days < 1 || days > MAX_ABSENCE_RANGE_DAYS) {
    throw new AppBadRequestException(
      ErrorCode.ABSENCE_INVALID_RANGE,
      'Ungültiger Zeitraum',
    );
  }
  if (days === 1) return [from];

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      dates.push(day.toISOString().slice(0, 10));
    }
  }
  if (dates.length === 0) {
    throw new AppBadRequestException(
      ErrorCode.ABSENCE_INVALID_RANGE,
      'Der Zeitraum enthält keine Arbeitstage',
    );
  }
  return dates;
}
