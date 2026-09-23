import { parseOptionalDateRange } from './date-range.util';
import { AppBadRequestException } from '../exceptions';

describe('parseOptionalDateRange', () => {
  it('returns an empty object when neither param is given', () => {
    expect(parseOptionalDateRange()).toEqual({});
  });

  it('returns parsed Date objects when both params are given', () => {
    const result = parseOptionalDateRange(
      '2025-01-01T00:00:00.000Z',
      '2025-01-31T23:59:59.000Z',
    );

    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.endDate).toBeInstanceOf(Date);
    expect(result.startDate?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(result.endDate?.toISOString()).toBe('2025-01-31T23:59:59.000Z');
  });

  it('throws when only startDate is given', () => {
    expect(() => parseOptionalDateRange('2025-01-01T00:00:00.000Z')).toThrow(
      AppBadRequestException,
    );
  });

  it('throws when only endDate is given', () => {
    expect(() =>
      parseOptionalDateRange(undefined, '2025-01-31T00:00:00.000Z'),
    ).toThrow(AppBadRequestException);
  });

  it('throws when a given date string is invalid', () => {
    expect(() =>
      parseOptionalDateRange('not-a-date', '2025-01-31T00:00:00.000Z'),
    ).toThrow(AppBadRequestException);
  });
});
