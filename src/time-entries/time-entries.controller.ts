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
import { parseOptionalDateRange } from '../common/utils/date-range.util';
import { isInCurrentWorkWeek } from '../common/utils/work-week.util';

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
   * Optional ?startDate=...&endDate=... (ISO-Datetime, nur zusammen) fuer die
   * Kalenderansicht - filtert nach startAt, typischerweise ohne limit.
   * Optional ?creatorId=... schränkt auf die Einträge einer Person ein
   * (Mitarbeiterauswahl für Admin/Owner). Mitarbeiter dürfen nur ihre eigene
   * ID angeben.
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limitParam?: string,
    @Query('cursor') cursorParam?: string,
    @Query('startDate') startDateParam?: string,
    @Query('endDate') endDateParam?: string,
    @Query('creatorId') requestedCreatorId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    const ownCreatorFilter = await this.resolveCreatorIdFilter(
      user,
      organizationIds,
    );
    if (
      requestedCreatorId &&
      ownCreatorFilter &&
      requestedCreatorId !== ownCreatorFilter
    ) {
      throw new AppForbiddenException(
        ErrorCode.AUTH_FORBIDDEN_GENERIC,
        'Mitarbeiter dürfen nur ihre eigenen Zeiteinträge sehen',
      );
    }
    const creatorId = requestedCreatorId || ownCreatorFilter;
    const { startDate, endDate } = parseOptionalDateRange(
      startDateParam,
      endDateParam,
    );
    const limit = parseOptionalLimit(limitParam);
    const cursor = cursorParam ? decodeTimeEntryCursor(cursorParam) : undefined;
    return this.timeEntriesService.findAllWithProject(
      organizationIds,
      creatorId,
      projectId,
      limit,
      cursor,
      startDate,
      endDate,
    );
  }

  /**
   * POST /time-entries
   * Normale User dürfen nur auf Projekte ihrer eigenen Organisation(en) buchen.
   * Mitarbeiter zudem nur in der laufenden Woche (keine Nachträge für frühere
   * Wochen) - Admin/Owner dürfen auch rückwirkend erfassen.
   */
  @Post()
  async create(@Body() dto: CreateTimeEntryDto, @CurrentUser() user: AuthUser) {
    // Admin/Owner duerfen fuer andere Mitglieder (auch ohne Login) erfassen
    const creatorId = dto.creatorId ?? user.id;
    const forSomeoneElse = creatorId !== user.id;

    if (user.role !== UserRole.ADMINISTRATOR) {
      const organizationId = await this.assertProjectInUsersOrganization(
        dto.projectId,
        user,
      );
      const isManager = await this.isOrganizationManager(
        user.id,
        organizationId,
      );
      if (forSomeoneElse) {
        if (!isManager) {
          throw new AppForbiddenException(
            ErrorCode.TIME_ENTRY_FOR_OTHERS_FORBIDDEN,
            'Nur Admins oder Owner dürfen Zeiten für andere erfassen',
          );
        }
        await this.assertMemberOfOrganization(creatorId, organizationId);
      }
      if (!isInCurrentWorkWeek(new Date(dto.startAt)) && !isManager) {
        throw new AppForbiddenException(
          ErrorCode.TIME_ENTRY_LOCKED,
          'Zeiten für frühere Wochen können nur noch von Admins erfasst werden',
        );
      }
    } else if (forSomeoneElse) {
      const project = await this.projectsService.findOne(dto.projectId);
      if (project) {
        await this.assertMemberOfOrganization(
          creatorId,
          project.organizationId,
        );
      }
    }

    return this.timeEntriesService.create({
      projectId: dto.projectId,
      categoryId: dto.categoryId ?? null,
      creatorId,
      createdById: user.id,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      comment: dto.comment,
      items: dto.items,
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
      await this.assertCanModifyTimeEntry(id, user, 'edit', dto.startAt);
    }

    return this.timeEntriesService.update(id, {
      categoryId: dto.categoryId,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      comment: dto.comment,
      items: dto.items,
    });
  }

  /**
   * DELETE /time-entries/:id
   * Admin/Owner (oder globale Administratoren) dürfen jeden Eintrag löschen,
   * Mitarbeiter nur ihre eigenen aus der laufenden Woche.
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertCanModifyTimeEntry(id, user, 'delete');
    }

    await this.timeEntriesService.delete(id);
    return { message: 'Zeiteintrag gelöscht', id };
  }

  private async assertProjectInUsersOrganization(
    projectId: string,
    user: AuthUser,
  ): Promise<string> {
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
    return project.organizationId;
  }

  private async assertMemberOfOrganization(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.membersService.findMembership(
      userId,
      organizationId,
    );
    if (!membership) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_TARGET_NOT_MEMBER,
        'Diese Person ist kein Mitglied der Organisation',
      );
    }
  }

  private async isOrganizationManager(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const membership = await this.membersService.findMembership(
      userId,
      organizationId,
    );
    return (
      membership?.role === OrganizationRole.ADMIN ||
      membership?.role === OrganizationRole.OWNER
    );
  }

  /**
   * Bearbeiten/Löschen eines Zeiteintrags:
   * - Admin/Owner der Organisation: immer.
   * - Mitarbeiter: nur eigene, selbst erfasste Einträge (nicht die, die ein
   *   Admin/Owner für sie erfasst hat) und nur in der laufenden Woche (ab
   *   Montag 00:00 Schweizer Zeit) - ältere sind für sie gesperrt. Beim
   *   Bearbeiten darf auch die neue Startzeit nicht in eine frühere Woche fallen.
   */
  private async assertCanModifyTimeEntry(
    timeEntryId: string,
    user: AuthUser,
    action: 'edit' | 'delete',
    newStartAt?: string,
  ): Promise<void> {
    const entry = await this.timeEntriesService.findOne(timeEntryId);
    if (!entry) {
      throw new AppNotFoundException(
        ErrorCode.TIME_ENTRY_NOT_FOUND,
        `Time entry with ID ${timeEntryId} not found`,
        { id: timeEntryId },
      );
    }

    if (
      await this.isOrganizationManager(user.id, entry.project.organizationId)
    ) {
      return;
    }

    if (entry.creatorId !== user.id) {
      throw action === 'edit'
        ? new AppForbiddenException(
            ErrorCode.TIME_ENTRY_EDIT_FORBIDDEN,
            'Nur Organisations-Admins oder -Owner dürfen fremde Zeiteinträge bearbeiten',
          )
        : new AppForbiddenException(
            ErrorCode.TIME_ENTRY_DELETE_FORBIDDEN,
            'Nur Organisations-Admins oder -Owner dürfen fremde Zeiteinträge löschen',
          );
    }

    // Vom Chef fuer den Mitarbeiter erfasste Eintraege kann er nicht aendern
    if (entry.createdById && entry.createdById !== entry.creatorId) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_CREATED_BY_MANAGER,
        'Dieser Eintrag wurde von einem Admin erfasst und kann nur von Admins geändert werden',
      );
    }

    const movesIntoPastWeek =
      newStartAt !== undefined && !isInCurrentWorkWeek(new Date(newStartAt));
    if (!isInCurrentWorkWeek(entry.startAt) || movesIntoPastWeek) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_LOCKED,
        'Einträge aus früheren Wochen können nur noch von Admins geändert werden',
      );
    }
  }
}
