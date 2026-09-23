import { AppBadRequestException, ErrorCode } from '../exceptions';

/**
 * Parst ein optionales startDate/endDate-Query-Parameter-Paar (ISO-Strings) -
 * beide muessen zusammen angegeben werden oder keines von beiden. Wirft bei
 * fehlendem Gegenstueck oder ungueltigem Datum, sonst {} (kein Filter) oder
 * die geparsten Date-Objekte.
 */
export function parseOptionalDateRange(
  startDateParam?: string,
  endDateParam?: string,
): { startDate?: Date; endDate?: Date } {
  if (Boolean(startDateParam) !== Boolean(endDateParam)) {
    throw new AppBadRequestException(
      ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
      'startDate and endDate must be provided together',
    );
  }

  if (!startDateParam || !endDateParam) {
    return {};
  }

  const startDate = new Date(startDateParam);
  const endDate = new Date(endDateParam);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new AppBadRequestException(
      ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
      'startDate/endDate must be valid dates',
    );
  }

  return { startDate, endDate };
}
