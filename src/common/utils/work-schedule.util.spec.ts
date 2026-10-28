import {
  DEFAULT_WORK_SCHEDULE,
  isValidWorkSchedule,
  workdayMinutes,
} from './work-schedule.util';

describe('work-schedule.util', () => {
  it('Standard-Arbeitstag 07:15-12:00, 13:00-17:00 dauert 8:45', () => {
    expect(workdayMinutes(DEFAULT_WORK_SCHEDULE)).toBe(525);
  });

  it('verlangt aufsteigende Zeiten, Mittagspause darf 0 sein', () => {
    expect(isValidWorkSchedule(DEFAULT_WORK_SCHEDULE)).toBe(true);
    expect(
      isValidWorkSchedule({
        ...DEFAULT_WORK_SCHEDULE,
        workAfternoonStart: '12:00',
      }),
    ).toBe(true);
    expect(
      isValidWorkSchedule({
        ...DEFAULT_WORK_SCHEDULE,
        workMorningEnd: '13:30',
      }),
    ).toBe(false);
    expect(
      isValidWorkSchedule({
        ...DEFAULT_WORK_SCHEDULE,
        workAfternoonEnd: '12:30',
      }),
    ).toBe(false);
  });
});
