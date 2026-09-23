import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export type ErrorParams = Record<string, string | number>;

/**
 * Basisklasse für alle App-Exceptions. Baut einen Response-Body, der additiv
 * zum bisherigen NestJS-Standard-Format ist: `message` bleibt exakt der
 * String, der bisher direkt an `new XyzException('...')` übergeben wurde
 * (Fallback-Text für Aufrufer, die weiterhin nur `.message` lesen) - `code`
 * und `params` sind neu und werden vom Frontend genutzt, um die Meldung in
 * der aktuellen UI-Sprache anzuzeigen (siehe fleettrack-app/lib/api/ApiError.ts).
 *
 * Kein globaler Exception-Filter nötig: der Body wird hier vollständig
 * selbst zusammengebaut, der HTTP-Status bleibt exakt wie vor der Umstellung.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    params?: ErrorParams,
  ) {
    super({ statusCode: status, code, message, params }, status);
  }
}

export class AppBadRequestException extends AppException {
  constructor(code: ErrorCode, message: string, params?: ErrorParams) {
    super(HttpStatus.BAD_REQUEST, code, message, params);
  }
}

export class AppUnauthorizedException extends AppException {
  constructor(code: ErrorCode, message: string, params?: ErrorParams) {
    super(HttpStatus.UNAUTHORIZED, code, message, params);
  }
}

export class AppForbiddenException extends AppException {
  constructor(code: ErrorCode, message: string, params?: ErrorParams) {
    super(HttpStatus.FORBIDDEN, code, message, params);
  }
}

export class AppNotFoundException extends AppException {
  constructor(code: ErrorCode, message: string, params?: ErrorParams) {
    super(HttpStatus.NOT_FOUND, code, message, params);
  }
}

export class AppConflictException extends AppException {
  constructor(code: ErrorCode, message: string, params?: ErrorParams) {
    super(HttpStatus.CONFLICT, code, message, params);
  }
}

export class AppInternalServerErrorException extends AppException {
  constructor(code: ErrorCode, message: string, params?: ErrorParams) {
    super(HttpStatus.INTERNAL_SERVER_ERROR, code, message, params);
  }
}
