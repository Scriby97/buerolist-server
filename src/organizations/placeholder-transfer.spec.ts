import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { OrganizationMemberEntity } from './organization-member.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { TimeEntryEntity } from '../time-entries/time-entry.entity';
import { AppConflictException } from '../common/exceptions';

describe('OrganizationsInvitesService.transferPlaceholder', () => {
  const manager = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const inviteRepository = {
    manager: {
      transaction: (fn: (m: typeof manager) => Promise<void>) => fn(manager),
    },
  };
  const service = new OrganizationsInvitesService(
    inviteRepository as never,
    {} as never,
    {} as never,
  );
  const invite = {
    id: 'inv',
    placeholderUserId: 'ph',
  } as OrganizationInviteEntity;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockResolvedValue({ id: 'ph', isPlaceholder: true });
  });

  it('übergibt Einträge an das echte Konto und entfernt den Platzhalter', async () => {
    await service.transferPlaceholder(invite, 'real');
    expect(manager.update).toHaveBeenCalledWith(
      TimeEntryEntity,
      { creatorId: 'ph' },
      { creatorId: 'real' },
    );
    expect(manager.delete).toHaveBeenCalledWith(OrganizationMemberEntity, {
      userId: 'ph',
    });
    expect(manager.delete).toHaveBeenCalledWith(UserProfileEntity, {
      id: 'ph',
    });
  });

  it('macht nichts ohne Platzhalter', async () => {
    await service.transferPlaceholder(
      { id: 'inv' } as OrganizationInviteEntity,
      'real',
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('meldet Überschneidungen mit bestehenden Einträgen verständlich', async () => {
    manager.update.mockRejectedValueOnce({ driverError: { code: '23P01' } });
    await expect(service.transferPlaceholder(invite, 'real')).rejects.toThrow(
      AppConflictException,
    );
  });
});
