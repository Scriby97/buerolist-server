import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { AuthService } from './auth.service';
import { UserProfileEntity } from './entities/user-profile.entity';
import { OrganizationMemberEntity } from '../organizations/organization-member.entity';
import { SupabaseService } from '../supabase/supabase.service';
import { AppBadRequestException } from '../common/exceptions';

describe('AuthService', () => {
  let service: AuthService;

  const manager = {
    findOne: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  const profileRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    manager,
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

  describe('deleteUnusedPlaceholder', () => {
    it('loescht einen Platzhalter ohne Organisation und ohne Eintraege', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'ph', isPlaceholder: true });
      manager.findOne.mockResolvedValue({ id: 'ph', isPlaceholder: true });
      manager.count.mockResolvedValue(0);

      await expect(service.deleteUnusedPlaceholder('ph')).resolves.toEqual({
        deleted: true,
      });
      expect(manager.delete).toHaveBeenCalledWith(UserProfileEntity, {
        id: 'ph',
      });
    });

    it('verweigert das Loeschen, wenn noch Zeiteintraege daran haengen', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'ph', isPlaceholder: true });
      manager.findOne.mockResolvedValue({ id: 'ph', isPlaceholder: true });
      manager.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);

      await expect(service.deleteUnusedPlaceholder('ph')).rejects.toThrow(
        AppBadRequestException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('loescht keine echten Konten mit Login', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'u', isPlaceholder: false });

      await expect(service.deleteUnusedPlaceholder('u')).rejects.toThrow(
        AppBadRequestException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateName', () => {
    it('speichert Vor- und Nachnamen und liefert das aktualisierte Profil', async () => {
      const profile = {
        id: 'user-1',
        firstName: 'Martin',
        lastName: 'Germann',
      };
      profileRepo.findOne.mockResolvedValue(profile);
      memberRepo.find.mockResolvedValue([]);

      await expect(
        service.updateName('user-1', {
          firstName: 'Martin',
          lastName: 'Germann',
        }),
      ).resolves.toMatchObject({ firstName: 'Martin', lastName: 'Germann' });
      expect(profileRepo.update).toHaveBeenCalledWith(
        { id: 'user-1' },
        { firstName: 'Martin', lastName: 'Germann' },
      );
    });
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
