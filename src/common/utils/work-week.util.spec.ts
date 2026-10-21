import {
  currentWeekStartKey,
  isInCurrentWorkWeek,
  zurichDateKey,
} from './work-week.util';

describe('work-week.util', () => {
  it('rechnet das Datum in Schweizer Zeit (nicht UTC)', () => {
    // 2026-10-18 23:30 UTC = Montag 19.10. 01:30 in Zuerich (Sommerzeit)
    expect(zurichDateKey(new Date('2026-10-18T23:30:00Z'))).toBe('2026-10-19');
  });

  it.each([
    ['2026-10-19T08:00:00+02:00', '2026-10-19'], // Montag
    ['2026-10-21T12:00:00+02:00', '2026-10-19'], // Mittwoch
    ['2026-10-25T23:00:00+01:00', '2026-10-19'], // Sonntag spaetabends (Winterzeit)
    ['2026-10-26T00:10:00+01:00', '2026-10-26'], // Montag kurz nach Mitternacht
  ])('Woche von %s beginnt am %s', (now, expected) => {
    expect(currentWeekStartKey(new Date(now))).toBe(expected);
  });

  describe('isInCurrentWorkWeek (heute = Mittwoch 21.10.2026)', () => {
    const now = new Date('2026-10-21T10:00:00+02:00');

    it('erlaubt Eintraege ab Montag dieser Woche', () => {
      expect(
        isInCurrentWorkWeek(new Date('2026-10-19T00:00:00+02:00'), now),
      ).toBe(true);
      expect(
        isInCurrentWorkWeek(new Date('2026-10-21T07:00:00+02:00'), now),
      ).toBe(true);
    });

    it('sperrt Eintraege bis und mit Sonntag der Vorwoche', () => {
      expect(
        isInCurrentWorkWeek(new Date('2026-10-18T23:59:00+02:00'), now),
      ).toBe(false);
      expect(
        isInCurrentWorkWeek(new Date('2026-10-12T07:00:00+02:00'), now),
      ).toBe(false);
    });
  });
});
