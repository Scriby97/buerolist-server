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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
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
 * Verwaltung der wiederverwendbaren Kategorien-Bibliothek einer Organisation
 * (z.B. Gerüstbau, Schleifen, Streichen) - siehe Plan "Datenmodell-
 * Entscheidungen". Lesen dürfen alle Mitglieder (für die Projekt-Erfassung),
 * Anlegen/Bearbeiten/Löschen nur Admin/Owner bzw. globale Administratoren,
 * exakt wie bei vehicles.controller.ts.
 */
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
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
        ErrorCode.ORG_CATEGORY_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Kategorien verwalten',
      );
    }
    throw new AppBadRequestException(
      ErrorCode.ORG_ID_AMBIGUOUS,
      'Bitte organizationId angeben - du verwaltest mehrere Organisationen',
    );
  }

  private async assertCanManageCategory(
    user: AuthUser,
    category: { organizationId: string },
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }

    const membership = await this.membersService.findMembership(
      user.id,
      category.organizationId,
    );

    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.ORG_CATEGORY_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Kategorien verwalten',
      );
    }
  }

  /**
   * GET /categories
   * Administratoren sehen alle oder filtern mit ?organizationId=...,
   * andere Rollen nur ihre eigene(n) Organisation(en).
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    return this.categoriesService.findAll(organizationIds);
  }

  @Post()
  async create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    const orgId = await this.resolveManagedOrganizationId(
      user,
      dto.organizationId,
    );
    return this.categoriesService.create({
      name: dto.name,
      organizationId: orgId,
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const category = await this.categoriesService.findOne(id);
    if (!category) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_NOT_FOUND,
        `Category with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageCategory(user, category);
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const category = await this.categoriesService.findOne(id);
    if (!category) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_NOT_FOUND,
        `Category with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageCategory(user, category);
    await this.categoriesService.delete(id);
    return { deleted: true };
  }
}
