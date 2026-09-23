import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

/**
 * Notizen (mit Fotos) pro Kunde oder pro Projekt - siehe CreateNoteDto.
 * Lesen passiert nicht über einen eigenen Endpoint, sondern eingebettet in
 * GET /customers/:id bzw. GET /projects/:id (siehe CustomersService/
 * ProjectsService.findOneDetailed) - Notizen tauchen nie isoliert auf.
 */
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  private async assertInSameOrg(
    user: AuthUser,
    organizationId: string,
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }
    const membership = await this.membersService.findMembership(
      user.id,
      organizationId,
    );
    if (!membership) {
      throw new AppForbiddenException(
        ErrorCode.ORG_NOT_MEMBER_OF_TARGET,
        'Du bist kein Mitglied dieser Organisation',
      );
    }
  }

  /**
   * Nur der Autor selbst oder Admin/Owner der Organisation dürfen eine
   * Notiz (bzw. ihre Fotos) wieder löschen.
   */
  private async assertCanDelete(
    user: AuthUser,
    note: { organizationId: string; authorId: string },
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR || note.authorId === user.id) {
      return;
    }
    const membership = await this.membersService.findMembership(
      user.id,
      note.organizationId,
    );
    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.NOTE_DELETE_FORBIDDEN,
        'Nur der Autor oder Organisations-Admins/-Owner dürfen diese Notiz löschen',
      );
    }
  }

  /**
   * POST /notes
   * Jedes Mitglied der Ziel-Organisation (Kunde oder Projekt) darf Notizen
   * anlegen - Notizen sind ein Arbeitsprotokoll, kein Verwaltungsvorgang.
   */
  @Post()
  async create(@Body() dto: CreateNoteDto, @CurrentUser() user: AuthUser) {
    const organizationId = await this.notesService.resolveTargetOrganization(
      dto.customerId,
      dto.projectId,
    );
    await this.assertInSameOrg(user, organizationId);
    return this.notesService.create({
      organizationId,
      customerId: dto.customerId,
      projectId: dto.projectId,
      authorId: user.id,
      text: dto.text,
    });
  }

  /**
   * POST /notes/:id/photos
   * multipart/form-data, Feld "file" - siehe OrganizationLogoService-Muster.
   */
  @Post(':id/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async addPhoto(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ) {
    if (!file) {
      throw new AppBadRequestException(
        ErrorCode.NOTE_PHOTO_INVALID,
        'Keine Datei hochgeladen',
      );
    }
    const note = await this.notesService.findOne(id);
    if (!note) {
      throw new AppNotFoundException(
        ErrorCode.NOTE_NOT_FOUND,
        `Note with ID ${id} not found`,
        { id },
      );
    }
    await this.assertInSameOrg(user, note.organizationId);
    return this.notesService.addPhoto(id, file);
  }

  @Delete(':id/photos/:photoId')
  async deletePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const note = await this.notesService.findOne(id);
    if (!note) {
      throw new AppNotFoundException(
        ErrorCode.NOTE_NOT_FOUND,
        `Note with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanDelete(user, note);
    await this.notesService.deletePhoto(id, photoId);
    return { deleted: true };
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const note = await this.notesService.findOne(id);
    if (!note) {
      throw new AppNotFoundException(
        ErrorCode.NOTE_NOT_FOUND,
        `Note with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanDelete(user, note);
    await this.notesService.delete(id);
    return { deleted: true };
  }
}
