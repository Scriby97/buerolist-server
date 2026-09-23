import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { AuthService } from './auth.service';
import { UserProfileEntity } from './entities/user-profile.entity';
import { OrganizationMemberEntity } from '../organizations/organization-member.entity';
import { SupabaseService } from '../supabase/supabase.service';

describe('AuthService', () => {
  let service: AuthService;

  const profileRepo = {
    findOne: jest.fn(),
  };

  const memberRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: {} },
        {
          provide: getRepositoryToken(UserProfileEntity),
          useValue: profileRepo,
        },
        {
          provide: getRepositoryToken(OrganizationMemberEntity),
          useValue: memberRepo,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('getUserProfile', () => {
    it('returns null when the profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      const result = await service.getUserProfile('user-1');

      expect(result).toBeNull();
      expect(memberRepo.find).not.toHaveBeenCalled();
    });

    it('only attaches non-archived memberships, excluding a membership archived after a self-delete', async () => {
      const profile = { id: 'user-1', organizationMemberships: [] };
      profileRepo.findOne.mockResolvedValue(profile);
      const activeMemberships = [{ id: 'member-1', organizationId: 'org-1' }];
      memberRepo.find.mockResolvedValue(activeMemberships);

      const result = await service.getUserProfile('user-1');

      expect(memberRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', archivedAt: IsNull() },
        relations: ['organization'],
        order: { joinedAt: 'ASC' },
      });
      expect(result?.organizationMemberships).toBe(activeMemberships);
    });
  });
});
