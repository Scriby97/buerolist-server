import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AbsencesService, type NewAbsence } from './absences.service';
import { CreateAbsenceDto, UpdateAbsenceDto } from './dto/absence.dto';
import {
  CreateAbsenceReasonDto,
  UpdateAbsenceReasonDto,
} from './dto/absence-reason.dto';
import { absenceDates } from './absence-dates.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { OrganizationRole, UserRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import {
  AppBadRequestException,
  AppForbiddenException,
  ErrorCode,
} from '../common/exceptions';
import { currentWeekStartKey } from '../common/utils/work-week.util';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Gemeinsame Rechtepruefung fuer Abwesenheiten und ihre Gruende - gleiche
 * Regeln wie bei Zeiteintraegen (siehe TimeEntriesController).
 */
abstract class AbsenceAccess {
  constructor(protected readonly membersService: OrganizationMembersService) {}

  protected async isManager(
    user: AuthUser,
    organizationId: string,
  ): Promise<boolean> {
    if (user.role === UserRole.ADMINISTRATOR) return true;
    const membership = await this.membersService.findMembership(
      user.id,
      organizationId,
    );
    return (
      membership?.role === OrganizationRole.ADMIN ||
      membership?.role === OrganizationRole.OWNER
    );
  }

  protected async assertMember(user: AuthUser, organizationId: string) {
    if (user.role === UserRole.ADMINISTRATOR) return;
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

  protected async assertManager(user: AuthUser, organizationId: string) {
    if (!(await this.isManager(user, organizationId))) {
      throw new AppForbiddenException(
        ErrorCode.ORG_NOT_MANAGER,
        'Nur Admins oder Owner dürfen Abwesenheitsgründe verwalten',
      );
    }
  }
}

/**
 * Abwesenheitsgruende einer Organisation. Lesen duerfen alle Mitglieder
 * (Auswahl beim Erfassen), Pflegen nur Admin/Owner.
 */
@Controller('absence-reasons')
export class AbsenceReasonsController extends AbsenceAccess {
  constructor(
    private readonly absencesService: AbsencesService,
    membersService: OrganizationMembersService,
  ) {
    super(membersService);
  }

  /** GET /absence-reasons?organizationId=... */
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    if (!organizationId) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'organizationId ist erforderlich',
      );
    }
    await this.assertMember(user, organizationId);
    return this.absencesService.findReasons(organizationId);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAbsenceReasonDto,
  ) {
    await this.assertManager(user, dto.organizationId);
    return this.absencesService.createReason(dto.organizationId, dto.name);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAbsenceReasonDto,
  ) {
    const reason = await this.absencesService.findReason(id);
    await this.assertManager(user, reason.organizationId);
    return this.absencesService.updateReason(id, dto.name);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const reason = await this.absencesService.findReason(id);
    await this.assertManager(user, reason.organizationId);
    await this.absencesService.removeReason(id);
    return { message: 'Abwesenheitsgrund gelöscht', id };
  }
}

/**
 * Abwesenheiten (Krankheit, Militaer, ...). Mitarbeiter sehen und erfassen
 * nur ihre eigenen - ab der laufenden Woche, auch in die Zukunft (z.B.
 * geplanter Militaerdienst). Admin/Owner sehen alle, erfassen auch fuer
 * andere und duerfen rueckwirkend aendern.
 */
@Controller('absences')
export class AbsencesController extends AbsenceAccess {
  constructor(
    private readonly absencesService: AbsencesService,
    membersService: OrganizationMembersService,
  ) {
    super(membersService);
  }

  /**
   * GET /absences?organizationId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&creatorId=...
   * from/to optional (inkl.). Mitarbeiter: nur eigene (creatorId nur die eigene).
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('creatorId') requestedCreatorId?: string,
  ) {
    if (
      !organizationId ||
      (from && !DATE_KEY.test(from)) ||
      (to && !DATE_KEY.test(to))
    ) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'organizationId ist erforderlich, from/to als YYYY-MM-DD',
      );
    }
    await this.assertMember(user, organizationId);
    const manager = await this.isManager(user, organizationId);
    if (!manager && requestedCreatorId && requestedCreatorId !== user.id) {
      throw new AppForbiddenException(
        ErrorCode.AUTH_FORBIDDEN_GENERIC,
        'Mitarbeiter dürfen nur ihre eigenen Abwesenheiten sehen',
      );
    }
    return this.absencesService.findAll({
      organizationIds: [organizationId],
      creatorId: manager ? requestedCreatorId || undefined : user.id,
      from,
      to,
    });
  }

  /**
   * POST /absences - ein Eintrag pro Person und Tag (Zeitraum ohne
   * Wochenenden). Alles oder nichts.
   */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAbsenceDto) {
    const creatorIds = dto.creatorIds?.length
      ? [...new Set(dto.creatorIds)]
      : [dto.creatorId ?? user.id];
    const others = creatorIds.filter((id) => id !== user.id);

    await this.assertMember(user, dto.organizationId);
    const manager = await this.isManager(user, dto.organizationId);
    if (others.length > 0) {
      if (!manager) {
        throw new AppForbiddenException(
          ErrorCode.TIME_ENTRY_FOR_OTHERS_FORBIDDEN,
          'Nur Admins oder Owner dürfen für andere erfassen',
        );
      }
      for (const id of others) {
        const membership = await this.membersService.findMembership(
          id,
          dto.organizationId,
        );
        if (!membership) {
          throw new AppForbiddenException(
            ErrorCode.TIME_ENTRY_TARGET_NOT_MEMBER,
            'Diese Person ist kein Mitglied der Organisation',
          );
        }
      }
    }
    if (!manager && dto.from < currentWeekStartKey()) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_LOCKED,
        'Abwesenheiten für frühere Wochen können nur noch von Admins erfasst werden',
      );
    }

    const reason = await this.absencesService.findReason(dto.reasonId);
    if (reason.organizationId !== dto.organizationId) {
      throw new AppForbiddenException(
        ErrorCode.ABSENCE_REASON_NOT_FOUND,
        'Abwesenheitsgrund gehört nicht zu dieser Organisation',
      );
    }

    const dates = absenceDates(dto.from, dto.to);
    const records: NewAbsence[] = [];
    for (const creatorId of creatorIds) {
      const minutes = await this.absencesService.minutesFor(
        creatorId,
        dto.portion,
        dto.minutes,
      );
      for (const date of dates) {
        records.push({
          organizationId: dto.organizationId,
          creatorId,
          createdById: user.id,
          reasonId: dto.reasonId,
          date,
          minutes,
          comment: dto.comment?.trim() || null,
        });
      }
    }
    return this.absencesService.createMany(records);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAbsenceDto,
  ) {
    const absence = await this.assertCanModify(user, id, 'edit', dto.date);
    if (dto.reasonId && dto.reasonId !== absence.reasonId) {
      const reason = await this.absencesService.findReason(dto.reasonId);
      if (reason.organizationId !== absence.organizationId) {
        throw new AppForbiddenException(
          ErrorCode.ABSENCE_REASON_NOT_FOUND,
          'Abwesenheitsgrund gehört nicht zu dieser Organisation',
        );
      }
    }
    return this.absencesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.assertCanModify(user, id, 'delete');
    await this.absencesService.remove(id);
    return { message: 'Abwesenheit gelöscht', id };
  }

  /**
   * Admin/Owner: immer. Mitarbeiter: nur eigene, selbst erfasste
   * Abwesenheiten ab der laufenden Woche (auch das neue Datum).
   */
  private async assertCanModify(
    user: AuthUser,
    id: string,
    action: 'edit' | 'delete',
    newDate?: string,
  ) {
    const absence = await this.absencesService.findOne(id);
    if (await this.isManager(user, absence.organizationId)) return absence;

    if (absence.creatorId !== user.id) {
      throw new AppForbiddenException(
        action === 'edit'
          ? ErrorCode.TIME_ENTRY_EDIT_FORBIDDEN
          : ErrorCode.TIME_ENTRY_DELETE_FORBIDDEN,
        'Nur Admins oder Owner dürfen fremde Abwesenheiten ändern',
      );
    }
    if (absence.createdById && absence.createdById !== absence.creatorId) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_CREATED_BY_MANAGER,
        'Diese Abwesenheit wurde von einem Admin erfasst und kann nur von Admins geändert werden',
      );
    }
    const weekStart = currentWeekStartKey();
    if (absence.date < weekStart || (newDate && newDate < weekStart)) {
      throw new AppForbiddenException(
        ErrorCode.TIME_ENTRY_LOCKED,
        'Abwesenheiten aus früheren Wochen können nur noch von Admins geändert werden',
      );
    }
    return absence;
  }
}
