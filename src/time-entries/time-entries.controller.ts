import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import {
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';
import {
  decodeTimeEntryCursor,
  parseOptionalLimit,
} from './time-entry-cursor.util';

@Controller('time-entries')
export class TimeEntriesController {
  constructor(
    private readonly timeEntriesService: TimeEntriesService,
    private readonly projectsService: ProjectsService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  private async resolveOrganizationIds(
    user: AuthUser,
    queryOrgId?: string,
  ): Promise<string[] | undefined> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return queryOrgId ? [queryOrgId] : undefined;
    }

    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );

    if (queryOrgId) {
      if (!organizationIds.includes(queryOrgId)) {
        throw new AppForbiddenException(
          ErrorCode.ORG_NOT_MEMBER_OF_TARGET,
          'Du bist kein Mitglied dieser Organisation',
        );
      }
      return [queryOrgId];
    }

    return organizationIds;
  }

  /**
   * Mitarbeiter (employee) sehen nur ihre eigenen Zeiteinträge; Admin/Owner
   * und globale Administratoren sehen alle - siehe UsagesController.
   */
  private async resolveCreatorIdFilter(
    user: AuthUser,
    organizationIds: string[] | undefined,
  ): Promise<string | undefined> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return undefined;
    }
    if (!organizationIds || organizationIds.length === 0) {
      return undefined;
    }

    for (const organizationId of organizationIds) {
      const membership = await this.membersService.findMembership(
        user.id,
        organizationId,
      );
      if (
        membership &&
        (membership.role === OrganizationRole.ADMIN ||
          membership.role === OrganizationRole.OWNER)
      ) {
        return undefined;
      }
    }

    return user.id;
  }

  /**
   * GET /time-entries
   * Cursor-paginiert (neueste zuerst), optional ?projectId=... für die
   * Zeit-Zusammenfassung eines einzelnen Projekts. Admin/Owner sehen alle
   * Einträge ihrer Organisation, Mitarbeiter nur ihre eigenen.
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limitParam?: string,
    @Query('cursor') cursorParam?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    const creatorId = await this.resolveCreatorIdFilter(user, organizationIds);
    const limit = parseOptionalLimit(limitParam);
    const cursor = cursorParam ? decodeTimeEntryCursor(cursorParam) : undefined;
    return this.timeEntriesService.findAllWithProject(
      organizationIds,
      creatorId,
      projectId,
      limit,
      cursor,
    );
  }

  /**
   * POST /time-entries
   * Normale User dürfen nur auf Projekte ihrer eigenen Organisation(en) buchen.
   */
  @Post()
  async create(@Body() dto: CreateTimeEntryDto, @CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertProjectInUsersOrganization(dto.projectId, user);
    }

    return this.timeEntriesService.create({
      projectId: dto.projectId,
      categoryId: dto.categoryId ?? null,
      creatorId: user.id,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
    });
  }

  /**
   * PUT /time-entries/:id
   * Admin/Owner dürfen jeden Eintrag bearbeiten, Mitarbeiter zusätzlich ihre
   * eigenen (aber keine fremden) - siehe UsagesController.
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertCanEditTimeEntry(id, user);
    }

    return this.timeEntriesService.update(id, {
      categoryId: dto.categoryId,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    });
  }

  /**
   * DELETE /time-entries/:id
   * Nur Admin/Owner (oder globale Administratoren) dürfen Zeiteinträge
   * löschen - Mitarbeiter nicht, auch nicht ihre eigenen.
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertCanManageTimeEntry(id, user);
    }

    await this.timeEntriesService.delete(id);
    return { message: 'Zeiteintrag gelöscht', id };
  }

  private async assertProjectInUsersOrganization(
    projectId: string,
    user: AuthUser,
  ): Promise<void> {
    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );
    if (organizationIds.length === 0) {
      throw new AppForbiddenException(
        ErrorCode.ORG_NO_MEMBERSHIP,
        'Du gehörst keiner Organisation an',
      );
    }

    const project = await this.projectsService.findOne(projectId);
    if (!project || !organizationIds.includes(project.organizationId)) {
      throw new AppForbiddenException(
        ErrorCode.PROJECT_NOT_IN_YOUR_ORG,
        'Projekt gehört nicht zu deiner Organisation',
      );
    }
  }

  private async assertCanManageTimeEntry(
    timeEntryId: string,
    user: AuthUser,
  ): Promise<void> {
    const entry = await this.timeEntriesService.findOne(timeEntryId);
    if (!entry) {
      throw new AppNotFoundException(
        ErrorCode.TIME_ENTRY_NOT_FOUND,
        `Time entry with ID ${timeEntryId} not found`,
        { id: timeEntryId },
      );
    }

    const membership = await this.membersService.findMembership(
      user.id,
      entry.project.organizationId,
    );
    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_DELETE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Zeiteinträge löschen',
      );
    }
  }

  private async assertCanEditTimeEntry(
    timeEntryId: string,
    user: AuthUser,
  ): Promise<void> {
    const entry = await this.timeEntriesService.findOne(timeEntryId);
    if (!entry) {
      throw new AppNotFoundException(
        ErrorCode.TIME_ENTRY_NOT_FOUND,
        `Time entry with ID ${timeEntryId} not found`,
        { id: timeEntryId },
      );
    }

    if (entry.creatorId === user.id) {
      return;
    }

    const membership = await this.membersService.findMembership(
      user.id,
      entry.project.organizationId,
    );
    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_EDIT_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen fremde Zeiteinträge bearbeiten',
      );
    }
  }
}
