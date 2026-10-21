// Arbeitswoche fuer die Bearbeitungssperre von Zeiteintraegen: Mitarbeiter
// duerfen eigene Eintraege nur in der laufenden Woche (ab Montag 00:00
// Schweizer Zeit) aendern/loeschen. Bewusst in Europe/Zurich gerechnet, nicht
// in der Server-Zeitzone (Render laeuft in UTC - sonst wuerde die Woche
// Montags erst um 01:00/02:00 Uhr Schweizer Zeit wechseln).

const TIME_ZONE = 'Europe/Zurich';

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Kalenderdatum in der Schweiz als "YYYY-MM-DD". */
export function zurichDateKey(date: Date): string {
  return dateKeyFormatter.format(date);
}

/** Montag der Woche von `now` (Schweizer Kalender) als "YYYY-MM-DD". */
export function currentWeekStartKey(now: Date = new Date()): string {
  const [year, month, day] = zurichDateKey(now).split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  const weekday = monday.getUTCDay() || 7; // Montag = 1 ... Sonntag = 7
  monday.setUTCDate(monday.getUTCDate() - (weekday - 1));
  return monday.toISOString().slice(0, 10);
}

/** Liegt `date` in der laufenden Woche (oder spaeter)? */
export function isInCurrentWorkWeek(
  date: Date,
  now: Date = new Date(),
): boolean {
  return zurichDateKey(date) >= currentWeekStartKey(now);
}
