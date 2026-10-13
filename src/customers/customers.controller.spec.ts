import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import { OrganizationRole, UserRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AppForbiddenException } from '../common/exceptions';

describe('CustomersController - nur Admin/Owner sehen Kunden', () => {
  const customersService = {
    findAll: jest.fn(),
    findOneDetailed: jest.fn(),
  };
  const membersService = {
    getManagedOrganizationIds: jest.fn(),
    findMembership: jest.fn(),
  };
  const controller = new CustomersController(
    customersService as unknown as CustomersService,
    membersService as unknown as OrganizationMembersService,
    {} as OrganizationSubscriptionsService,
  );

  const user = { id: 'me', role: UserRole.USER } as unknown as AuthUser;
  const detail = { customer: { id: 'c-1', organizationId: 'org-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    customersService.findAll.mockResolvedValue([]);
    customersService.findOneDetailed.mockResolvedValue(detail);
  });

  describe('als normaler Mitarbeiter', () => {
    beforeEach(() => {
      membersService.getManagedOrganizationIds.mockResolvedValue([]);
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.EMPLOYEE,
      });
    });

    it('darf die Kundenliste seiner Organisation nicht abrufen', async () => {
      await expect(controller.getAll(user, 'org-1')).rejects.toThrow(
        AppForbiddenException,
      );
      expect(customersService.findAll).not.toHaveBeenCalled();
    });

    it('bekommt ohne organizationId keine Kunden', async () => {
      await controller.getAll(user);
      expect(customersService.findAll).toHaveBeenCalledWith([]);
    });

    it('darf keine Kunden-Details abrufen', async () => {
      await expect(controller.getOne('c-1', user)).rejects.toThrow(
        AppForbiddenException,
      );
    });
  });

  describe('als Admin/Owner', () => {
    beforeEach(() => {
      membersService.getManagedOrganizationIds.mockResolvedValue(['org-1']);
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.OWNER,
      });
    });

    it('sieht die Kundenliste', async () => {
      await controller.getAll(user, 'org-1');
      expect(customersService.findAll).toHaveBeenCalledWith(['org-1']);
    });

    it('sieht die Kunden-Details', async () => {
      await expect(controller.getOne('c-1', user)).resolves.toBe(detail);
    });
  });
});
