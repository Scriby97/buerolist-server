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
import { ItemPresetsService } from './item-presets.service';
import {
  CreateItemPresetDto,
  UpdateItemPresetDto,
} from './dto/item-preset.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { OrganizationRole, UserRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import {
  AppBadRequestException,
  AppForbiddenException,
  ErrorCode,
} from '../common/exceptions';

/**
 * Vordefinierte Material-/Spesen-Positionen einer Organisation. Lesen duerfen
 * alle Mitglieder (Auswahl beim Erfassen), Pflegen nur Admin/Owner bzw.
 * globale Administratoren.
 */
@Controller('item-presets')
export class ItemPresetsController {
  constructor(
    private readonly presetsService: ItemPresetsService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  private async assertMember(user: AuthUser, organizationId: string) {
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

  private async assertManager(user: AuthUser, organizationId: string) {
    if (user.role === UserRole.ADMINISTRATOR) return;
    const membership = await this.membersService.findMembership(
      user.id,
      organizationId,
    );
    if (
      membership?.role !== OrganizationRole.ADMIN &&
      membership?.role !== OrganizationRole.OWNER
    ) {
      throw new AppForbiddenException(
        ErrorCode.ORG_NOT_MANAGER,
        'Nur Admins oder Owner dürfen Vorlagen verwalten',
      );
    }
  }

  /** GET /item-presets?organizationId=... */
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
    return this.presetsService.findAll(organizationId);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateItemPresetDto,
  ) {
    await this.assertManager(user, dto.organizationId);
    return this.presetsService.create(dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateItemPresetDto,
  ) {
    const preset = await this.presetsService.findOne(id);
    await this.assertManager(user, preset.organizationId);
    return this.presetsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const preset = await this.presetsService.findOne(id);
    await this.assertManager(user, preset.organizationId);
    await this.presetsService.remove(id);
    return { message: 'Vorlage gelöscht', id };
  }
}
