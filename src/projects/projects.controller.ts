import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectEntity } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly membersService: OrganizationMembersService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
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

  private async resolveManagedOrganizationId(
    user: AuthUser,
    requestedOrgId?: string,
  ): Promise<string> {
    if (user.role === UserRole.ADMINISTRATOR) {
      if (!requestedOrgId) {
        throw new AppBadRequestException(
          ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
          'Organization ID is required',
        );
      }
      return requestedOrgId;
    }

    const managedOrgIds = await this.membersService.getManagedOrganizationIds(
      user.id,
    );

    if (requestedOrgId) {
      if (!managedOrgIds.includes(requestedOrgId)) {
        throw new AppForbiddenException(
          ErrorCode.ORG_NOT_MANAGER,
          'Du bist nicht Admin oder Owner dieser Organisation',
        );
      }
      return requestedOrgId;
    }

    if (managedOrgIds.length === 1) {
      return managedOrgIds[0];
    }
    if (managedOrgIds.length === 0) {
      throw new AppForbiddenException(
        ErrorCode.ORG_PROJECT_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Projekte verwalten',
      );
    }
    throw new AppBadRequestException(
      ErrorCode.ORG_ID_AMBIGUOUS,
      'Bitte organizationId angeben - du verwaltest mehrere Organisationen',
    );
  }

  private async assertInSameOrg(
    user: AuthUser,
    project: { organizationId: string },
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }
    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );
    if (!organizationIds.includes(project.organizationId)) {
      throw new AppForbiddenException(
        ErrorCode.PROJECT_NOT_IN_YOUR_ORG,
        'Projekt gehört nicht zu deiner Organisation',
      );
    }
  }

  private async assertCanManageProject(
    user: AuthUser,
    project: ProjectEntity,
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }

    const membership = await this.membersService.findMembership(
      user.id,
      project.organizationId,
    );

    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.ORG_PROJECT_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Projekte verwalten',
      );
    }
  }

  private async assertProjectLimitNotExceeded(
    organizationId: string,
  ): Promise<void> {
    const limits = await this.subscriptionsService.getLimits(organizationId);
    if (limits.maxProjects === null) {
      return;
    }

    const currentCount = await this.projectsService.countActive(organizationId);
    if (currentCount >= limits.maxProjects) {
      throw new AppForbiddenException(
        ErrorCode.PROJECT_LIMIT_REACHED,
        `Das Projekt-Limit von ${limits.maxProjects} für den aktuellen Tarif ist erreicht. Bitte upgraden Sie das Abonnement, um weitere Projekte zu erfassen.`,
        { limit: limits.maxProjects },
      );
    }
  }

  /**
   * GET /projects
   * Für die Projekt-Auswahl bei der Zeiterfassung - alle Mitglieder einer
   * Organisation dürfen die (aktiven) Projekte ihrer Organisation sehen.
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    return this.projectsService.findAll(organizationIds);
  }

  /**
   * GET /projects/:id
   * Projekt-Detailansicht inkl. Kategorien, Notizen+Fotos und
   * Zeit-Zusammenfassung pro Mitarbeiter/Kategorie.
   */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const detail = await this.projectsService.findOneDetailed(id);
    if (!detail) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${id} not found`,
        { id },
      );
    }
    await this.assertInSameOrg(user, detail.project);
    return detail;
  }

  @Post()
  async create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    const orgId = await this.resolveManagedOrganizationId(
      user,
      dto.organizationId,
    );
    await this.assertProjectLimitNotExceeded(orgId);
    return this.projectsService.create({
      title: dto.title,
      customerId: dto.customerId,
      organizationId: orgId,
      categoryIds: dto.categoryIds,
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    const project = await this.projectsService.findOne(id);
    if (!project) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageProject(user, project);
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const project = await this.projectsService.findOne(id);
    if (!project) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageProject(user, project);
    await this.projectsService.delete(id);
    return { deleted: true };
  }
}
