// Normaler Arbeitstag eines Mitarbeiters (siehe migrations/013): zwei Bloecke
// Vormittag/Nachmittag, je "HH:mm".

export interface WorkSchedule {
  workMorningStart: string;
  workMorningEnd: string;
  workAfternoonStart: string;
  workAfternoonEnd: string;
}

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  workMorningStart: '07:15',
  workMorningEnd: '12:00',
  workAfternoonStart: '13:00',
  workAfternoonEnd: '17:00',
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Gueltig, wenn die vier Zeiten aufsteigend sind (Mittagspause darf 0 sein). */
export function isValidWorkSchedule(s: WorkSchedule): boolean {
  const [a, b, c, d] = [
    s.workMorningStart,
    s.workMorningEnd,
    s.workAfternoonStart,
    s.workAfternoonEnd,
  ].map(toMinutes);
  return a < b && b <= c && c < d;
}

/** Dauer eines normalen Arbeitstags in Minuten (beide Bloecke zusammen). */
export function workdayMinutes(s: WorkSchedule): number {
  return (
    toMinutes(s.workMorningEnd) -
    toMinutes(s.workMorningStart) +
    toMinutes(s.workAfternoonEnd) -
    toMinutes(s.workAfternoonStart)
  );
}
