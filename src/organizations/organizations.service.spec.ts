import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { OrganizationsService } from './organizations.service';
import { OrganizationEntity } from './organization.entity';
import { ProjectEntity } from '../projects/project.entity';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationSubscriptionsService } from './organization-subscriptions.service';
import { OrganizationMembersService } from './organization-members.service';
import {
  AppBadRequestException,
  AppNotFoundException,
} from '../common/exceptions';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const organizationRepository = {
    findOne: jest.fn(),
    save: jest.fn((data) => Promise.resolve(data)),
    remove: jest.fn(),
  };

  const projectRepository = {
    update: jest.fn(),
  };

  const invitesService = {
    deleteAllForOrganization: jest.fn(),
  };

  const membersService = {
    archiveAllMembers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: getRepositoryToken(OrganizationEntity),
          useValue: organizationRepository,
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: projectRepository,
        },
        { provide: OrganizationsInvitesService, useValue: invitesService },
        { provide: OrganizationSubscriptionsService, useValue: {} },
        { provide: OrganizationMembersService, useValue: membersService },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('deleteByOwner', () => {
    it('archives all members and projects and marks the organization as deletion-requested', async () => {
      const organization = { id: 'org-1', deletionRequestedAt: null };
      organizationRepository.findOne.mockResolvedValue(organization);

      await service.deleteByOwner('org-1');

      expect(membersService.archiveAllMembers).toHaveBeenCalledWith('org-1');
      expect(projectRepository.update).toHaveBeenCalledWith(
        { organizationId: 'org-1', archivedAt: IsNull() },
        { archivedAt: expect.any(Date) },
      );
      expect(organization.deletionRequestedAt).toEqual(expect.any(Date));
      expect(organizationRepository.save).toHaveBeenCalledWith(organization);
    });

    it('throws when the organization does not exist', async () => {
      organizationRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteByOwner('org-1')).rejects.toThrow(
        AppNotFoundException,
      );
      expect(membersService.archiveAllMembers).not.toHaveBeenCalled();
    });
  });

  describe('hardDelete', () => {
    it('refuses to delete an organization the owner has not released for deletion', async () => {
      organizationRepository.findOne.mockResolvedValue({
        id: 'org-1',
        deletionRequestedAt: null,
      });

      await expect(service.hardDelete('org-1')).rejects.toThrow(
        AppBadRequestException,
      );
      expect(invitesService.deleteAllForOrganization).not.toHaveBeenCalled();
      expect(organizationRepository.remove).not.toHaveBeenCalled();
    });

    it('deletes invites first, then the organization itself', async () => {
      const organization = { id: 'org-1', deletionRequestedAt: new Date() };
      organizationRepository.findOne.mockResolvedValue(organization);

      await service.hardDelete('org-1');

      expect(invitesService.deleteAllForOrganization).toHaveBeenCalledWith(
        'org-1',
      );
      expect(organizationRepository.remove).toHaveBeenCalledWith(organization);
    });
  });
});
