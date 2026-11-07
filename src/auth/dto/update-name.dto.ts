import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Eigener Vor- und Nachname (beide Pflicht, wie bei der Registrierung). */
export class UpdateNameDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  lastName: string;
}
