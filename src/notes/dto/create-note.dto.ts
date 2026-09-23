import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  text: string;
}
