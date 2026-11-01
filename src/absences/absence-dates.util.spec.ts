import { absenceDates } from './absence-dates.util';

describe('absenceDates', () => {
  it('returns a single day, even on a weekend', () => {
    expect(absenceDates('2026-10-31')).toEqual(['2026-10-31']);
  });

  it('skips weekends within a range', () => {
    // Do 29.10. bis Di 3.11.2026
    expect(absenceDates('2026-10-29', '2026-11-03')).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-11-02',
      '2026-11-03',
    ]);
  });

  it('rejects an end before the start', () => {
    expect(() => absenceDates('2026-10-29', '2026-10-28')).toThrow();
  });

  it('rejects a range with only weekend days', () => {
    expect(() => absenceDates('2026-10-31', '2026-11-01')).toThrow();
  });

  it('rejects ranges longer than a year', () => {
    expect(() => absenceDates('2026-01-01', '2027-06-01')).toThrow();
  });
});
