import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Genau eines von customerId/projectId muss gesetzt sein - geprüft im
// NotesService (assertExactlyOneTarget), zusätzlich per SQL-CHECK-Constraint
// in der Migration abgesichert.
export class CreateNoteDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  // Optional: eine Notiz kann auch nur aus Fotos bestehen (Fotos werden
  // direkt nach dem Anlegen hochgeladen).
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;
}
