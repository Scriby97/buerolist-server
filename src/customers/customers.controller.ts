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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
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

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
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
        ErrorCode.ORG_CUSTOMER_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Kunden verwalten',
      );
    }
    throw new AppBadRequestException(
      ErrorCode.ORG_ID_AMBIGUOUS,
      'Bitte organizationId angeben - du verwaltest mehrere Organisationen',
    );
  }

  private async assertInSameOrg(
    user: AuthUser,
    customer: { organizationId: string },
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }
    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );
    if (!organizationIds.includes(customer.organizationId)) {
      throw new AppForbiddenException(
        ErrorCode.CUSTOMER_NOT_IN_YOUR_ORG,
        'Kunde gehört nicht zu deiner Organisation',
      );
    }
  }

  private async assertCanManageCustomer(
    user: AuthUser,
    customer: { organizationId: string },
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }

    const membership = await this.membersService.findMembership(
      user.id,
      customer.organizationId,
    );

    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.ORG_CUSTOMER_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Kunden verwalten',
      );
    }
  }

  /**
   * GET /customers
   * Alle Mitglieder einer Organisation dürfen die Kundenliste sehen (für die
   * Projekt-/Zeiterfassung), Verwalten (Anlegen/Bearbeiten/Löschen) bleibt
   * Admin/Owner vorbehalten.
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    return this.customersService.findAll(organizationIds);
  }

  /**
   * GET /customers/:id
   * Kunden-Detailansicht inkl. Projekt-History und Notizen+Fotos.
   */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const detail = await this.customersService.findOneDetailed(id);
    if (!detail) {
      throw new AppNotFoundException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        `Customer with ID ${id} not found`,
        { id },
      );
    }
    await this.assertInSameOrg(user, detail.customer);
    return detail;
  }

  @Post()
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    const orgId = await this.resolveManagedOrganizationId(
      user,
      dto.organizationId,
    );
    return this.customersService.create({
      name: dto.name,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      address: dto.address,
      organizationId: orgId,
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    const customer = await this.customersService.findOne(id);
    if (!customer) {
      throw new AppNotFoundException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        `Customer with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageCustomer(user, customer);
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const customer = await this.customersService.findOne(id);
    if (!customer) {
      throw new AppNotFoundException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        `Customer with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageCustomer(user, customer);
    await this.customersService.delete(id);
    return { deleted: true };
  }
}
