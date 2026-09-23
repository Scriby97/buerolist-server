import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { OrganizationEntity } from './organization.entity';
import { OrganizationMemberEntity } from './organization-member.entity';

describe('OrganizationsInvitesService', () => {
  let service: OrganizationsInvitesService;

  const inviteRepository = {
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsInvitesService,
        {
          provide: getRepositoryToken(OrganizationInviteEntity),
          useValue: inviteRepository,
        },
        { provide: getRepositoryToken(OrganizationEntity), useValue: {} },
        { provide: getRepositoryToken(OrganizationMemberEntity), useValue: {} },
      ],
    }).compile();

    service = module.get<OrganizationsInvitesService>(
      OrganizationsInvitesService,
    );
  });

  describe('deleteAllForOrganization', () => {
    it('deletes every invite belonging to the organization', async () => {
      await service.deleteAllForOrganization('org-1');

      expect(inviteRepository.delete).toHaveBeenCalledWith({
        organizationId: 'org-1',
      });
    });
  });
});
