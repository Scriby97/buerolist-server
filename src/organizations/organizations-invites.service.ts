import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, MoreThan, Repository } from 'typeorm';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { OrganizationEntity } from './organization.entity';
import { OrganizationMemberEntity } from './organization-member.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { randomBytes } from 'crypto';
import {
  AppBadRequestException,
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

@Injectable()
export class OrganizationsInvitesService {
  private readonly logger = new Logger(OrganizationsInvitesService.name);

  constructor(
    @InjectRepository(OrganizationInviteEntity)
    private readonly inviteRepository: Repository<OrganizationInviteEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepository: Repository<OrganizationMemberEntity>,
  ) {}

  /**
   * Erstellt einen neuen Invite-Link für eine Organisation
   * Die role ist die OrganizationRole (employee/admin/owner) - nicht die UserRole
   */
  async createInvite(
    organizationId: string,
    createInviteDto: CreateInviteDto,
    invitedBy?: string,
  ): Promise<OrganizationInviteEntity> {
    this.logger.log(
      `createInvite start organizationId=${organizationId} email=${createInviteDto.email} invitedBy=${invitedBy || 'none'}`,
    );

    // Prüfe ob Organisation existiert
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppNotFoundException(
        ErrorCode.INVITE_ORGANIZATION_NOT_FOUND,
        'Organization not found',
      );
    }

    if (!organization.isActive) {
      throw new AppBadRequestException(
        ErrorCode.ORGANIZATION_INACTIVE,
        'Organization is not active',
      );
    }

    // Prüfe ob bereits ein aktiver Invite für diese Email existiert
    const existingInvite = await this.inviteRepository.findOne({
      where: {
        organizationId,
        email: createInviteDto.email,
        usedAt: IsNull(),
      },
    });

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      throw new AppConflictException(
        ErrorCode.INVITE_ALREADY_EXISTS,
        'An active invite for this email already exists',
      );
    }

    // Generiere einzigartigen Token
    const token = this.generateInviteToken();

    // Invite läuft in 7 Tagen ab
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = this.inviteRepository.create({
      token,
      organizationId,
      email: createInviteDto.email,
      role: createInviteDto.role || OrganizationRole.EMPLOYEE,
      invitedBy,
      expiresAt,
    });

    this.logger.log(
      `createInvite prepared invite organizationId=${invite.organizationId} tokenPrefix=${invite.token.substring(0, 10)}`,
    );

    const savedInvite = await this.inviteRepository.save(invite);

    this.logger.log(
      `createInvite saved inviteId=${savedInvite.id} organizationId=${savedInvite.organizationId} tokenPrefix=${savedInvite.token.substring(0, 10)}`,
    );

    return savedInvite;
  }

  /**
   * Validiert einen Invite-Token
   */
  async validateInvite(token: string): Promise<OrganizationInviteEntity> {
    const invite = await this.inviteRepository.findOne({
      where: { token },
      relations: ['organization'],
    });

    if (!invite) {
      throw new AppNotFoundException(
        ErrorCode.INVITE_NOT_FOUND,
        'Invite not found',
      );
    }

    if (invite.usedAt) {
      throw new AppBadRequestException(
        ErrorCode.INVITE_ALREADY_USED,
        'This invite has already been used',
      );
    }

    if (invite.expiresAt < new Date()) {
      throw new AppBadRequestException(
        ErrorCode.INVITE_EXPIRED,
        'This invite has expired',
      );
    }

    if (!invite.organization.isActive) {
      throw new AppBadRequestException(
        ErrorCode.ORGANIZATION_INACTIVE,
        'Organization is not active',
      );
    }

    return invite;
  }

  /**
   * Loescht eine eingeloeste Einladung. Eingeloeste Einladungen muessen
   * nicht mehr aufgelistet werden - statt sie wie frueher nur mit
   * usedAt/usedBy zu markieren, wird die Zeile direkt entfernt, sobald die
   * zugehoerige Mitgliedschaft erfolgreich angelegt wurde (daher IMMER erst
   * NACH createMembership aufrufen - schlaegt die Mitgliedschaft fehl,
   * bleibt die Einladung so noch gueltig und der Link nochmal nutzbar).
   */
  async deleteConsumedInvite(invite: OrganizationInviteEntity): Promise<void> {
    await this.inviteRepository.remove(invite);
    this.logger.debug(`Eingeloeste Einladung geloescht: id=${invite.id}`);
  }

  /**
   * Loescht alle Einladungen einer Organisation. Noetig vor einem echten
   * Loeschen der Organisation selbst (siehe OrganizationsService.hardDelete) -
   * organization_invites.organizationId hat kein ON DELETE CASCADE, ein
   * Loeschen der Organisation wuerde sonst an dieser Fremdschluessel-
   * Beziehung scheitern, falls noch (offene oder abgelaufene) Einladungen
   * existieren.
   */
  async deleteAllForOrganization(organizationId: string): Promise<void> {
    await this.inviteRepository.delete({ organizationId });
  }

  /**
   * Erstellt eine Organization-Membership für einen User
   * Wird nach erfolgreichem Accept eines Invites aufgerufen
   */
  async createMembership(
    userId: string,
    organizationId: string,
    role: OrganizationRole = OrganizationRole.EMPLOYEE,
  ): Promise<OrganizationMemberEntity> {
    this.logger.log(
      `createMembership userId=${userId} organizationId=${organizationId} role=${role}`,
    );

    // Prüfe ob Membership bereits existiert
    const existingMembership = await this.memberRepository.findOne({
      where: { userId, organizationId },
    });

    if (existingMembership) {
      this.logger.warn(
        `Membership already exists for userId=${userId} organizationId=${organizationId}`,
      );
      return existingMembership;
    }

    const membership = this.memberRepository.create({
      userId,
      organizationId,
      role,
    });

    const saved = await this.memberRepository.save(membership);
    this.logger.log(`Membership created: id=${saved.id}`);

    return saved;
  }

  /**
   * Holt alle offenen (nicht verwendeten, nicht abgelaufenen) Invites für eine Email
   * Für "Meine Einladungen" im Frontend
   */
  async getInvitesByEmail(email: string): Promise<OrganizationInviteEntity[]> {
    return await this.inviteRepository.find({
      where: {
        email: ILike(email),
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Akzeptiert einen Invite für einen bereits eingeloggten, existierenden User
   * (im Gegensatz zu POST /invites/accept, das immer einen neuen User registriert)
   */
  async acceptInviteForExistingUser(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<OrganizationMemberEntity> {
    const invite = await this.validateInvite(token);

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new AppForbiddenException(
        ErrorCode.INVITE_EMAIL_MISMATCH,
        'Diese Einladung ist nicht an deine Email-Adresse gerichtet',
      );
    }

    const membership = await this.createMembership(
      userId,
      invite.organizationId,
      invite.role,
    );
    await this.deleteConsumedInvite(invite);
    return membership;
  }

  /**
   * Lehnt einen Invite ab (entfernt ihn), nur der eingeladene User selbst darf das
   */
  async declineInvite(token: string, userEmail: string): Promise<void> {
    const invite = await this.validateInvite(token);

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new AppForbiddenException(
        ErrorCode.INVITE_EMAIL_MISMATCH,
        'Diese Einladung ist nicht an deine Email-Adresse gerichtet',
      );
    }

    await this.inviteRepository.remove(invite);
  }

  /**
   * Anzahl offener (nicht verwendeter, nicht abgelaufener) Invites einer
   * Organisation - zählt beim maxMembers-Tarif-Limit mit, damit nicht mehr
   * Invites verschickt werden können als noch freie Plätze vorhanden sind.
   */
  async countPendingByOrganization(organizationId: string): Promise<number> {
    return this.inviteRepository.count({
      where: {
        organizationId,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  /**
   * Holt alle Invites einer Organisation
   */
  async getInvitesByOrganization(
    organizationId: string,
  ): Promise<OrganizationInviteEntity[]> {
    return await this.inviteRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Holt alle Invites über alle Organisationen
   */
  async getAllInvites(): Promise<OrganizationInviteEntity[]> {
    return await this.inviteRepository.find({
      relations: ['organization'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Löscht einen Invite
   * Administrators can delete any invite
   * Organization admins/owners can only delete invites from organizations they manage
   */
  async deleteInvite(
    inviteId: string,
    userRole?: string,
    managedOrganizationIds?: string[],
  ): Promise<void> {
    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new AppNotFoundException(
        ErrorCode.INVITE_NOT_FOUND,
        'Invite not found',
      );
    }

    if (
      userRole !== UserRole.ADMINISTRATOR &&
      !(managedOrganizationIds ?? []).includes(invite.organizationId)
    ) {
      throw new AppForbiddenException(
        ErrorCode.INVITE_DELETE_FORBIDDEN,
        'You can only delete invites from your organization',
      );
    }

    await this.inviteRepository.remove(invite);
  }

  /**
   * Generiert einen sicheren, einzigartigen Token
   */
  private generateInviteToken(): string {
    return randomBytes(32).toString('hex');
  }
}
