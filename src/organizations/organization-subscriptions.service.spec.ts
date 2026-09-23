import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Not } from 'typeorm';
import { OrganizationSubscriptionsService } from './organization-subscriptions.service';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import { OrganizationMembersService } from './organization-members.service';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectStatus } from '../projects/project-status.enum';
import {
  SubscriptionTier,
  SubscriptionStatus,
} from './enums/subscription-tier.enum';

describe('OrganizationSubscriptionsService', () => {
  let service: OrganizationSubscriptionsService;

  const subscriptionRepository = {
    findOne: jest.fn(),
    save: jest.fn((data) => Promise.resolve(data)),
  };
  const projectRepository = {
    count: jest.fn(),
    update: jest.fn(),
  };
  const membersService = {
    countByOrganization: jest.fn(),
    archiveMembersExceptOwner: jest.fn(),
    restoreArchivedMembers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationSubscriptionsService,
        {
          provide: getRepositoryToken(OrganizationSubscriptionEntity),
          useValue: subscriptionRepository,
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: projectRepository,
        },
        { provide: OrganizationMembersService, useValue: membersService },
      ],
    }).compile();

    service = module.get<OrganizationSubscriptionsService>(
      OrganizationSubscriptionsService,
    );
  });

  describe('getFreeLimitStatus', () => {
    it('excludes archived/completed projects from the count', async () => {
      projectRepository.count.mockResolvedValue(1);
      membersService.countByOrganization.mockResolvedValue(1);

      await service.getFreeLimitStatus('org-1');

      expect(projectRepository.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: ProjectStatus.ACTIVE,
          archivedAt: IsNull(),
        },
      });
      expect(membersService.countByOrganization).toHaveBeenCalledWith('org-1');
    });
  });

  describe('downgradeToFree', () => {
    const baseSubscription = {
      organizationId: 'org-1',
      tier: SubscriptionTier.PRO,
      status: SubscriptionStatus.ACTIVE,
    };

    it('archives members (except owner) and projects when over the free-tier limit', async () => {
      subscriptionRepository.findOne.mockResolvedValue({ ...baseSubscription });
      projectRepository.count.mockResolvedValue(5); // > maxProjects (1)
      membersService.countByOrganization.mockResolvedValue(1);

      await service.downgradeToFree('org-1');

      expect(membersService.archiveMembersExceptOwner).toHaveBeenCalledWith(
        'org-1',
      );
      expect(projectRepository.update).toHaveBeenCalledWith(
        { organizationId: 'org-1', archivedAt: IsNull() },
        { archivedAt: expect.any(Date) },
      );
    });

    it('does not archive anything when the organization stays within the free-tier limit', async () => {
      subscriptionRepository.findOne.mockResolvedValue({ ...baseSubscription });
      projectRepository.count.mockResolvedValue(1);
      membersService.countByOrganization.mockResolvedValue(2);

      await service.downgradeToFree('org-1');

      expect(membersService.archiveMembersExceptOwner).not.toHaveBeenCalled();
      expect(projectRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('activatePaidTier', () => {
    it('restores previously archived members and projects for the same organization', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        organizationId: 'org-1',
        tier: SubscriptionTier.FREE,
        status: SubscriptionStatus.ACTIVE,
      });

      await service.activatePaidTier(
        'org-1',
        SubscriptionTier.PRO,
        'cus_123',
        'sub_123',
      );

      expect(membersService.restoreArchivedMembers).toHaveBeenCalledWith(
        'org-1',
      );
      expect(projectRepository.update).toHaveBeenCalledWith(
        { organizationId: 'org-1', archivedAt: Not(IsNull()) },
        { archivedAt: null },
      );
    });
  });
});
