import { AbsencesController } from './absences.controller';
import type { AbsencesService } from './absences.service';
import type { OrganizationMembersService } from '../organizations/organization-members.service';
import { OrganizationRole, UserRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  AppBadRequestException,
  AppForbiddenException,
} from '../common/exceptions';
import { currentWeekStartKey } from '../common/utils/work-week.util';

describe('AbsencesController', () => {
  const service = {
    findAll: jest.fn().mockResolvedValue([]),
    findReason: jest.fn(),
    findOne: jest.fn(),
    minutesFor: jest.fn().mockResolvedValue(525),
    createMany: jest.fn((records: unknown[]) => Promise.resolve(records)),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const members = { findMembership: jest.fn() };
  const controller = new AbsencesController(
    service as unknown as AbsencesService,
    members as unknown as OrganizationMembersService,
  );

  const employee: AuthUser = { id: 'emp', role: UserRole.USER };
  const owner: AuthUser = { id: 'own', role: UserRole.USER };
  const roleOf = (userId: string) =>
    userId === 'own' ? OrganizationRole.OWNER : OrganizationRole.EMPLOYEE;
  const thisMonday = currentWeekStartKey();

  const baseDto = {
    organizationId: 'org',
    reasonId: 'r1',
    from: thisMonday,
    portion: 'full' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    members.findMembership.mockImplementation((userId: string) =>
      Promise.resolve({ role: roleOf(userId) }),
    );
    service.findReason.mockResolvedValue({ id: 'r1', organizationId: 'org' });
  });

  describe('findAll', () => {
    it('restricts employees to their own absences', async () => {
      await controller.findAll(employee, 'org', '2026-10-01', '2026-10-31');
      expect(service.findAll).toHaveBeenCalledWith({
        organizationIds: ['org'],
        creatorId: 'emp',
        from: '2026-10-01',
        to: '2026-10-31',
      });
    });

    it('forbids employees to look at someone else', async () => {
      await expect(
        controller.findAll(employee, 'org', undefined, undefined, 'own'),
      ).rejects.toBeInstanceOf(AppForbiddenException);
    });

    it('lets owners see everyone or filter by person', async () => {
      await controller.findAll(owner, 'org');
      expect(service.findAll.mock.calls[0][0].creatorId).toBeUndefined();
      await controller.findAll(owner, 'org', undefined, undefined, 'emp');
      expect(service.findAll.mock.calls[1][0].creatorId).toBe('emp');
    });
  });

  describe('create', () => {
    it('creates one absence per weekday of the range', async () => {
      const result = (await controller.create(owner, {
        ...baseDto,
        from: '2026-10-29',
        to: '2026-11-03',
        comment: '  WK  ',
      })) as unknown as { date: string; minutes: number; comment: string }[];
      expect(result.map((r) => r.date)).toEqual([
        '2026-10-29',
        '2026-10-30',
        '2026-11-02',
        '2026-11-03',
      ]);
      expect(result[0]).toMatchObject({
        creatorId: 'own',
        createdById: 'own',
        minutes: 525,
        comment: 'WK',
      });
    });

    it('lets owners record for several people', async () => {
      const result = (await controller.create(owner, {
        ...baseDto,
        creatorIds: ['own', 'emp'],
      })) as unknown as { creatorId: string }[];
      expect(result.map((r) => r.creatorId)).toEqual(['own', 'emp']);
    });

    it('forbids employees to record for others', async () => {
      await expect(
        controller.create(employee, { ...baseDto, creatorId: 'own' }),
      ).rejects.toBeInstanceOf(AppForbiddenException);
      expect(service.createMany).not.toHaveBeenCalled();
    });

    it('forbids employees to record for past weeks', async () => {
      await expect(
        controller.create(employee, { ...baseDto, from: '2020-01-06' }),
      ).rejects.toBeInstanceOf(AppForbiddenException);
    });

    it('accepts an own reason instead of a predefined one', async () => {
      const result = (await controller.create(employee, {
        ...baseDto,
        reasonId: undefined,
        reasonText: '  Umzug ',
      })) as unknown as { reasonId: string | null; reasonText: string }[];
      expect(result[0]).toMatchObject({ reasonId: null, reasonText: 'Umzug' });
      expect(service.findReason).not.toHaveBeenCalled();
    });

    it('requires a predefined or an own reason', async () => {
      await expect(
        controller.create(employee, {
          ...baseDto,
          reasonId: undefined,
          reasonText: '  ',
        }),
      ).rejects.toBeInstanceOf(AppBadRequestException);
    });

    it('rejects a reason of another organization', async () => {
      service.findReason.mockResolvedValue({ id: 'r1', organizationId: 'x' });
      await expect(controller.create(owner, baseDto)).rejects.toBeInstanceOf(
        AppForbiddenException,
      );
    });
  });

  describe('update / remove', () => {
    const absence = (overrides: object = {}) => ({
      id: 'a1',
      organizationId: 'org',
      creatorId: 'emp',
      createdById: 'emp',
      reasonId: 'r1',
      date: thisMonday,
      ...overrides,
    });

    it('lets employees change their own absence of this week', async () => {
      service.findOne.mockResolvedValue(absence());
      await controller.update(employee, 'a1', { minutes: 240 });
      expect(service.update).toHaveBeenCalledWith('a1', { minutes: 240 });
    });

    it('locks absences a manager recorded for the employee', async () => {
      service.findOne.mockResolvedValue(absence({ createdById: 'own' }));
      await expect(controller.remove(employee, 'a1')).rejects.toBeInstanceOf(
        AppForbiddenException,
      );
    });

    it('locks absences of past weeks for employees', async () => {
      service.findOne.mockResolvedValue(absence({ date: '2020-01-06' }));
      await expect(
        controller.update(employee, 'a1', { minutes: 60 }),
      ).rejects.toBeInstanceOf(AppForbiddenException);
    });

    it('lets owners change any absence', async () => {
      service.findOne.mockResolvedValue(
        absence({ date: '2020-01-06', createdById: 'own' }),
      );
      await controller.remove(owner, 'a1');
      expect(service.remove).toHaveBeenCalledWith('a1');
    });
  });
});
