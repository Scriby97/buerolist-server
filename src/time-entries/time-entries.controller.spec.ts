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

describe('TimeEntriesController - Bearbeiten/Löschen nur in der laufenden Woche', () => {
  const findOne = jest.fn();
  const update = jest.fn().mockResolvedValue({});
  const deleteEntry = jest.fn().mockResolvedValue(undefined);
  const membersService = {
    getOrganizationIds: jest.fn(),
    findMembership: jest.fn(),
  };
  const controller = new TimeEntriesController(
    { findOne, update, delete: deleteEntry } as unknown as TimeEntriesService,
    {} as ProjectsService,
    membersService as unknown as OrganizationMembersService,
  );

  const me = { id: 'me', role: UserRole.USER } as unknown as AuthUser;

  // Heute: Mittwoch, 21.10.2026 - Woche beginnt am Montag 19.10.
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-21T10:00:00+02:00') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const entryOn = (startAt: string, creatorId = 'me') => ({
    id: 'e1',
    creatorId,
    startAt: new Date(startAt),
    project: { organizationId: 'org-1' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    membersService.findMembership.mockResolvedValue({
      role: OrganizationRole.EMPLOYEE,
    });
  });

  describe('als Mitarbeiter', () => {
    it('darf eigene Einträge dieser Woche bearbeiten und löschen', async () => {
      findOne.mockResolvedValue(entryOn('2026-10-19T07:00:00+02:00'));
      await controller.update('e1', { comment: 'x' }, me);
      await controller.remove('e1', me);
      expect(update).toHaveBeenCalled();
      expect(deleteEntry).toHaveBeenCalledWith('e1');
    });

    it('darf eigene Einträge der Vorwoche weder bearbeiten noch löschen', async () => {
      findOne.mockResolvedValue(entryOn('2026-10-16T07:00:00+02:00'));
      await expect(
        controller.update('e1', { comment: 'x' }, me),
      ).rejects.toThrow(AppForbiddenException);
      await expect(controller.remove('e1', me)).rejects.toThrow(
        AppForbiddenException,
      );
      expect(update).not.toHaveBeenCalled();
      expect(deleteEntry).not.toHaveBeenCalled();
    });

    it('darf einen Eintrag dieser Woche nicht in die Vorwoche verschieben', async () => {
      findOne.mockResolvedValue(entryOn('2026-10-20T07:00:00+02:00'));
      await expect(
        controller.update(
          'e1',
          {
            startAt: '2026-10-16T07:00:00+02:00',
            endAt: '2026-10-16T09:00:00+02:00',
          },
          me,
        ),
      ).rejects.toThrow(AppForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('darf fremde Einträge nicht löschen', async () => {
      findOne.mockResolvedValue(
        entryOn('2026-10-20T07:00:00+02:00', 'someone-else'),
      );
      await expect(controller.remove('e1', me)).rejects.toThrow(
        AppForbiddenException,
      );
    });
  });

  describe('als Admin/Owner', () => {
    it('darf auch alte und fremde Einträge bearbeiten und löschen', async () => {
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.ADMIN,
      });
      findOne.mockResolvedValue(
        entryOn('2026-09-01T07:00:00+02:00', 'someone-else'),
      );
      await controller.update('e1', { comment: 'x' }, me);
      await controller.remove('e1', me);
      expect(update).toHaveBeenCalled();
      expect(deleteEntry).toHaveBeenCalledWith('e1');
    });
  });
});

describe('TimeEntriesController.create - keine Nachträge für frühere Wochen', () => {
  const create = jest.fn().mockResolvedValue({});
  const membersService = {
    getOrganizationIds: jest.fn().mockResolvedValue(['org-1']),
    findMembership: jest.fn(),
  };
  const projectsService = {
    findOne: jest.fn().mockResolvedValue({ id: 'p1', organizationId: 'org-1' }),
  };
  const controller = new TimeEntriesController(
    { create } as unknown as TimeEntriesService,
    projectsService as unknown as ProjectsService,
    membersService as unknown as OrganizationMembersService,
  );
  const me = { id: 'me', role: UserRole.USER } as unknown as AuthUser;
  const dto = (day: string) => ({
    projectId: 'p1',
    startAt: `${day}T07:00:00+02:00`,
    endAt: `${day}T09:00:00+02:00`,
  });

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-21T10:00:00+02:00') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  beforeEach(() => jest.clearAllMocks());

  it('Mitarbeiter: diese Woche erlaubt, Vorwoche gesperrt', async () => {
    membersService.findMembership.mockResolvedValue({
      role: OrganizationRole.EMPLOYEE,
    });
    await controller.create(dto('2026-10-19'), me);
    expect(create).toHaveBeenCalledTimes(1);

    await expect(controller.create(dto('2026-10-16'), me)).rejects.toThrow(
      AppForbiddenException,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('Admin/Owner: darf auch rückwirkend erfassen', async () => {
    membersService.findMembership.mockResolvedValue({
      role: OrganizationRole.OWNER,
    });
    await controller.create(dto('2026-09-01'), me);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
