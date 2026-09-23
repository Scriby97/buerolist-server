import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Nur für globale Administratoren Pflicht (die für jede Organisation
  // anlegen können) - Org-Admins/Owner bekommen ihre eigene Organisation
  // vom Controller automatisch gesetzt, siehe resolveManagedOrganizationId.
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
