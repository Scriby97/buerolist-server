import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Not } from 'typeorm';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationRole } from '../auth/enums/user-role.enum';
import {
  AppNotFoundException,
  AppBadRequestException,
  AppForbiddenException,
} from '../common/exceptions';

describe('OrganizationMembersService', () => {
  let service: OrganizationMembersService;

  // The transaction manager's own repository (used only by transferOwnership).
  const transactionRepo = {
    findOne: jest.fn(),
    save: jest.fn((data) => Promise.resolve(data)),
  };

  const memberRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    save: jest.fn((data) => Promise.resolve(data)),
    manager: {
      transaction: jest.fn((cb) =>
        cb({ getRepository: () => transactionRepo }),
      ),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMembersService,
        {
          provide: getRepositoryToken(OrganizationMemberEntity),
          useValue: memberRepository,
        },
      ],
    }).compile();

    service = module.get<OrganizationMembersService>(
      OrganizationMembersService,
    );
  });

  describe('remove', () => {
    it('throws MEMBER_NOT_FOUND when the member does not exist', async () => {
      memberRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('org-1', 'member-1')).rejects.toThrow(
        AppNotFoundException,
      );
      expect(memberRepository.remove).not.toHaveBeenCalled();
    });

    it('removes a non-owner member without checking the owner count', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.EMPLOYEE,
      });

      await service.remove('org-1', 'member-1');

      expect(memberRepository.count).not.toHaveBeenCalled();
      expect(memberRepository.remove).toHaveBeenCalledWith({
        id: 'member-1',
        role: OrganizationRole.EMPLOYEE,
      });
    });

    it('refuses to remove the last owner', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.OWNER,
      });
      memberRepository.count.mockResolvedValue(1);

      await expect(service.remove('org-1', 'member-1')).rejects.toThrow(
        AppBadRequestException,
      );
      expect(memberRepository.remove).not.toHaveBeenCalled();
    });

    it('removes an owner when at least one other owner remains', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.OWNER,
      });
      memberRepository.count.mockResolvedValue(2);

      await service.remove('org-1', 'member-1');

      expect(memberRepository.remove).toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('throws when trying to change the role of the current owner', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.OWNER,
      });

      await expect(
        service.updateRole(
          'org-1',
          'member-1',
          OrganizationRole.ADMIN,
          OrganizationRole.OWNER,
        ),
      ).rejects.toThrow(AppBadRequestException);
      expect(memberRepository.save).not.toHaveBeenCalled();
    });

    it('throws when trying to promote a member to owner', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.ADMIN,
      });

      await expect(
        service.updateRole(
          'org-1',
          'member-1',
          OrganizationRole.OWNER,
          OrganizationRole.OWNER,
        ),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('forbids an admin (non-owner caller) from demoting another admin', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.ADMIN,
      });

      await expect(
        service.updateRole(
          'org-1',
          'member-1',
          OrganizationRole.EMPLOYEE,
          OrganizationRole.ADMIN,
        ),
      ).rejects.toThrow(AppForbiddenException);
      expect(memberRepository.save).not.toHaveBeenCalled();
    });

    it('lets the owner demote an admin to employee', async () => {
      const member = { id: 'member-1', role: OrganizationRole.ADMIN };
      memberRepository.findOne.mockResolvedValue(member);

      const result = await service.updateRole(
        'org-1',
        'member-1',
        OrganizationRole.EMPLOYEE,
        OrganizationRole.OWNER,
      );

      expect(result.role).toBe(OrganizationRole.EMPLOYEE);
      expect(memberRepository.save).toHaveBeenCalledWith(member);
    });

    it('lets any admin/owner promote an employee to admin', async () => {
      const member = { id: 'member-1', role: OrganizationRole.EMPLOYEE };
      memberRepository.findOne.mockResolvedValue(member);

      const result = await service.updateRole(
        'org-1',
        'member-1',
        OrganizationRole.ADMIN,
        OrganizationRole.ADMIN,
      );

      expect(result.role).toBe(OrganizationRole.ADMIN);
    });
  });

  describe('transferOwnership', () => {
    beforeEach(() => {
      transactionRepo.findOne.mockReset();
      transactionRepo.save.mockClear();
    });

    it('refuses to transfer ownership to yourself', async () => {
      await expect(
        service.transferOwnership('org-1', 'member-1', 'member-1'),
      ).rejects.toThrow(AppBadRequestException);
      expect(memberRepository.manager.transaction).not.toHaveBeenCalled();
    });

    it('throws when the current owner membership cannot be confirmed as owner', async () => {
      transactionRepo.findOne
        .mockResolvedValueOnce({ id: 'member-1', role: OrganizationRole.ADMIN }) // not actually owner
        .mockResolvedValueOnce({
          id: 'member-2',
          role: OrganizationRole.EMPLOYEE,
        });

      await expect(
        service.transferOwnership('org-1', 'member-1', 'member-2'),
      ).rejects.toThrow(AppBadRequestException);
      expect(transactionRepo.save).not.toHaveBeenCalled();
    });

    it('throws when the target member does not exist', async () => {
      transactionRepo.findOne
        .mockResolvedValueOnce({ id: 'member-1', role: OrganizationRole.OWNER })
        .mockResolvedValueOnce(null);

      await expect(
        service.transferOwnership('org-1', 'member-1', 'member-2'),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('swaps roles atomically: previous owner becomes admin, target becomes owner', async () => {
      const currentOwner = { id: 'member-1', role: OrganizationRole.OWNER };
      const newOwner = { id: 'member-2', role: OrganizationRole.EMPLOYEE };
      transactionRepo.findOne
        .mockResolvedValueOnce(currentOwner)
        .mockResolvedValueOnce(newOwner);

      const result = await service.transferOwnership(
        'org-1',
        'member-1',
        'member-2',
      );

      expect(result.previousOwner.role).toBe(OrganizationRole.ADMIN);
      expect(result.newOwner.role).toBe(OrganizationRole.OWNER);
      expect(transactionRepo.save).toHaveBeenCalledWith([
        currentOwner,
        newOwner,
      ]);
    });
  });

  describe('archiveMembersExceptOwner', () => {
    it('archives every non-owner membership but leaves the owner untouched', async () => {
      await service.archiveMembersExceptOwner('org-1');

      expect(memberRepository.update).toHaveBeenCalledWith(
        {
          organizationId: 'org-1',
          role: Not(OrganizationRole.OWNER),
          archivedAt: IsNull(),
        },
        { archivedAt: expect.any(Date) },
      );
    });
  });

  describe('archiveAllMembers', () => {
    it('archives every membership of the organization, including the owner', async () => {
      await service.archiveAllMembers('org-1');

      expect(memberRepository.update).toHaveBeenCalledWith(
        { organizationId: 'org-1', archivedAt: IsNull() },
        { archivedAt: expect.any(Date) },
      );
    });
  });

  describe('restoreArchivedMembers', () => {
    it('clears archivedAt for every previously archived membership', async () => {
      await service.restoreArchivedMembers('org-1');

      expect(memberRepository.update).toHaveBeenCalledWith(
        { organizationId: 'org-1', archivedAt: Not(IsNull()) },
        { archivedAt: null },
      );
    });
  });
});
