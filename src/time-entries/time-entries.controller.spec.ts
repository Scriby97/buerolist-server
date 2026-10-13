import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { ProjectsService } from '../projects/projects.service';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { OrganizationRole, UserRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AppForbiddenException } from '../common/exceptions';

describe('TimeEntriesController.getAll - creatorId filter', () => {
  const findAllWithProject = jest.fn();
  const membersService = {
    getOrganizationIds: jest.fn(),
    findMembership: jest.fn(),
  };
  const controller = new TimeEntriesController(
    { findAllWithProject } as unknown as TimeEntriesService,
    {} as ProjectsService,
    membersService as unknown as OrganizationMembersService,
  );

  const user = { id: 'me', role: UserRole.USER } as unknown as AuthUser;

  const getAll = (creatorId?: string) =>
    controller.getAll(
      user,
      'org-1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      creatorId,
    );

  // 2. Argument von findAllWithProject ist der creatorId-Filter.
  const passedCreatorId = () => findAllWithProject.mock.calls[0][1];

  beforeEach(() => {
    jest.clearAllMocks();
    membersService.getOrganizationIds.mockResolvedValue(['org-1']);
    findAllWithProject.mockResolvedValue({ timeEntries: [], nextCursor: null });
  });

  describe('as org admin/owner', () => {
    beforeEach(() => {
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.OWNER,
      });
    });

    it('sees all entries without creatorId', async () => {
      await getAll();
      expect(passedCreatorId()).toBeUndefined();
    });

    it('filters by the requested person', async () => {
      await getAll('someone-else');
      expect(passedCreatorId()).toBe('someone-else');
    });
  });

  describe('as employee', () => {
    beforeEach(() => {
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.EMPLOYEE,
      });
    });

    it('is restricted to own entries without creatorId', async () => {
      await getAll();
      expect(passedCreatorId()).toBe('me');
    });

    it('may pass its own id', async () => {
      await getAll('me');
      expect(passedCreatorId()).toBe('me');
    });

    it('is forbidden from requesting someone else', async () => {
      await expect(getAll('someone-else')).rejects.toBeInstanceOf(
        AppForbiddenException,
      );
      expect(findAllWithProject).not.toHaveBeenCalled();
    });
  });
});
