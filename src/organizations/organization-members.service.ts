import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationRole } from '../auth/enums/user-role.enum';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

@Injectable()
export class OrganizationMembersService {
  constructor(
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepository: Repository<OrganizationMemberEntity>,
  ) {}

  /**
   * Alle Mitglieder einer Organisation inkl. User-Daten
   */
  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationMemberEntity[]> {
    return this.memberRepository.find({
      where: { organizationId, archivedAt: IsNull() },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * Owner (Name + Email) für mehrere Organisationen auf einmal, für die
   * Admin-Organisationsübersicht - vermeidet eine Einzelabfrage pro
   * Organisation.
   */
  async findOwners(
    organizationIds: string[],
  ): Promise<Map<string, { email: string; name?: string }>> {
    if (organizationIds.length === 0) return new Map();

    const owners = await this.memberRepository.find({
      where: {
        organizationId: In(organizationIds),
        role: OrganizationRole.OWNER,
        archivedAt: IsNull(),
      },
      relations: ['user'],
    });

    return new Map(
      owners.map((member) => [
        member.organizationId,
        {
          email: member.user.email,
          name:
            [member.user.firstName, member.user.lastName]
              .filter(Boolean)
              .join(' ') || undefined,
        },
      ]),
    );
  }

  /**
   * Fügt einen User als Owner einer Organisation hinzu (Self-Service-Erstellung)
   */
  async addOwner(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMemberEntity> {
    const member = this.memberRepository.create({
      organizationId,
      userId,
      role: OrganizationRole.OWNER,
    });
    return this.memberRepository.save(member);
  }

  /**
   * Alle Organisationen, in denen ein User Mitglied ist
   */
  async findByUser(userId: string): Promise<OrganizationMemberEntity[]> {
    return this.memberRepository.find({
      where: { userId, archivedAt: IsNull() },
      relations: ['organization'],
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * IDs aller Organisationen, in denen ein User Mitglied ist.
   * Für Daten-Scoping bei normalen Usern (projects/time-entries) - ein leeres Array
   * bedeutet, der User gehört keiner Organisation an und darf keine Daten sehen.
   */
  async getOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await this.memberRepository.find({
      where: { userId, archivedAt: IsNull() },
      select: ['organizationId'],
    });
    return memberships.map((membership) => membership.organizationId);
  }

  /**
   * IDs aller Organisationen, in denen der User Admin oder Owner ist.
   * Owner hat automatisch auch alle Admin-Rechte (Rollen-Hierarchie owner > admin > employee).
   */
  async getManagedOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await this.memberRepository.find({
      where: {
        userId,
        role: In([OrganizationRole.ADMIN, OrganizationRole.OWNER]),
        archivedAt: IsNull(),
      },
      select: ['organizationId'],
    });
    return memberships.map((membership) => membership.organizationId);
  }

  /**
   * Anzahl Mitglieder einer Organisation - für die Durchsetzung des
   * maxMembers-Tarif-Limits (zusammen mit den offenen Invites gezählt, siehe
   * OrganizationsInvitesService.countPendingByOrganization).
   */
  async countByOrganization(organizationId: string): Promise<number> {
    return this.memberRepository.count({
      where: { organizationId, archivedAt: IsNull() },
    });
  }

  /**
   * Die Mitgliedschaft eines Users in einer bestimmten Organisation (oder null)
   */
  async findMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMemberEntity | null> {
    return this.memberRepository.findOne({
      where: { userId, organizationId, archivedAt: IsNull() },
    });
  }

  /**
   * Ändert die Rolle eines Mitglieds - ausser der Owner-Rolle, die nur über
   * transferOwnership() geändert werden kann (siehe dort). Zusätzlich zur
   * Mindestrolle "Admin" (bereits von OrganizationRolesGuard geprüft) gilt:
   * Nur der Owner darf einen Admin zurück zu Employee degradieren.
   */
  async updateRole(
    organizationId: string,
    memberId: string,
    role: OrganizationRole,
    callerRole: OrganizationRole,
  ): Promise<OrganizationMemberEntity> {
    const member = await this.findMemberOrThrow(organizationId, memberId);

    if (
      member.role === OrganizationRole.OWNER ||
      role === OrganizationRole.OWNER
    ) {
      throw new AppBadRequestException(
        ErrorCode.MEMBER_ROLE_OWNER_VIA_TRANSFER_ONLY,
        'Die Owner-Rolle kann nur über die Rollen-Übergabe geändert werden',
      );
    }

    if (
      member.role === OrganizationRole.ADMIN &&
      role === OrganizationRole.EMPLOYEE &&
      callerRole !== OrganizationRole.OWNER
    ) {
      throw new AppForbiddenException(
        ErrorCode.MEMBER_DEMOTE_FORBIDDEN,
        'Nur der Owner kann einen Admin zum Mitarbeiter zurückstufen',
      );
    }

    member.role = role;
    return this.memberRepository.save(member);
  }

  /**
   * Übergibt die Owner-Rolle atomar an ein anderes Mitglied - der bisherige
   * Owner wird dabei Admin. Läuft in einer Transaktion, damit nie 0 oder 2
   * Owner gleichzeitig existieren können.
   */
  async transferOwnership(
    organizationId: string,
    currentOwnerMembershipId: string,
    newOwnerMemberId: string,
  ): Promise<{
    previousOwner: OrganizationMemberEntity;
    newOwner: OrganizationMemberEntity;
  }> {
    if (newOwnerMemberId === currentOwnerMembershipId) {
      throw new AppBadRequestException(
        ErrorCode.MEMBER_ALREADY_OWNER,
        'Du bist bereits Owner dieser Organisation',
      );
    }

    return this.memberRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(OrganizationMemberEntity);

      const [currentOwner, newOwner] = await Promise.all([
        repo.findOne({
          where: { id: currentOwnerMembershipId, organizationId },
        }),
        repo.findOne({ where: { id: newOwnerMemberId, organizationId } }),
      ]);

      if (!currentOwner || currentOwner.role !== OrganizationRole.OWNER) {
        throw new AppBadRequestException(
          ErrorCode.MEMBER_CURRENT_OWNER_NOT_FOUND,
          'Aktueller Owner konnte nicht ermittelt werden',
        );
      }
      if (!newOwner) {
        throw new AppNotFoundException(
          ErrorCode.MEMBER_TARGET_NOT_FOUND,
          'Ziel-Mitglied nicht gefunden',
        );
      }

      currentOwner.role = OrganizationRole.ADMIN;
      newOwner.role = OrganizationRole.OWNER;
      await repo.save([currentOwner, newOwner]);

      return { previousOwner: currentOwner, newOwner };
    });
  }

  async remove(organizationId: string, memberId: string): Promise<void> {
    const member = await this.findMemberOrThrow(organizationId, memberId);

    if (member.role === OrganizationRole.OWNER) {
      await this.assertNotLastOwner(organizationId);
    }

    await this.memberRepository.remove(member);
  }

  /**
   * Archiviert alle Mitgliedschaften einer Organisation ausser dem Owner -
   * für den Fall, dass eine Organisation über dem kostenlosen Lieutenant-Limit
   * (Fahrzeuge oder Mitarbeiter) liegt und ihr bezahltes Abo endgültig endet
   * (siehe OrganizationSubscriptionsService.downgradeToFree). Der Owner bleibt
   * bewusst unangetastet - sonst könnte sich niemand mehr einloggen, um die
   * Organisation durch erneute Zahlung wiederherzustellen (siehe
   * restoreArchivedMembers). Setzt nur "archivedAt", löscht nichts - die
   * Mitgliedschaften (und alle anderen Daten: Fahrzeuge, Nutzungen, die
   * Organisation selbst) bleiben vollständig erhalten.
   */
  async archiveMembersExceptOwner(organizationId: string): Promise<void> {
    await this.memberRepository.update(
      {
        organizationId,
        role: Not(OrganizationRole.OWNER),
        archivedAt: IsNull(),
      },
      { archivedAt: new Date() },
    );
  }

  /**
   * Archiviert ALLE Mitgliedschaften einer Organisation, inklusive Owner -
   * für den Fall, dass der Owner seine Organisation selbst löscht (siehe
   * OrganizationsService.deleteByOwner). Im Unterschied zu
   * archiveMembersExceptOwner bleibt hier niemand ausgenommen: der Owner
   * verliert dadurch (über den OrganizationGuard, der archivierte
   * Mitgliedschaften ausschliesst) ebenfalls sofort den Zugriff. Setzt nur
   * "archivedAt", löscht nichts - siehe archiveMembersExceptOwner.
   */
  async archiveAllMembers(organizationId: string): Promise<void> {
    await this.memberRepository.update(
      { organizationId, archivedAt: IsNull() },
      { archivedAt: new Date() },
    );
  }

  /**
   * Holt alle wegen Nichtzahlung archivierten Mitgliedschaften einer
   * Organisation zurück - aufgerufen, sobald dieselbe Organisation wieder ein
   * bezahltes Abo aktiviert (siehe
   * OrganizationSubscriptionsService.activatePaidTier). Ist nichts archiviert,
   * ist dieser Aufruf ein No-Op.
   */
  async restoreArchivedMembers(organizationId: string): Promise<void> {
    await this.memberRepository.update(
      { organizationId, archivedAt: Not(IsNull()) },
      { archivedAt: null },
    );
  }

  private async findMemberOrThrow(
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMemberEntity> {
    const member = await this.memberRepository.findOne({
      where: { id: memberId, organizationId, archivedAt: IsNull() },
    });

    if (!member) {
      throw new AppNotFoundException(
        ErrorCode.MEMBER_NOT_FOUND,
        'Organization member not found',
      );
    }

    return member;
  }

  private async assertNotLastOwner(organizationId: string): Promise<void> {
    const ownerCount = await this.memberRepository.count({
      where: {
        organizationId,
        role: OrganizationRole.OWNER,
        archivedAt: IsNull(),
      },
    });

    if (ownerCount <= 1) {
      throw new AppBadRequestException(
        ErrorCode.MEMBER_LAST_OWNER,
        'Cannot remove or demote the last owner of an organization',
      );
    }
  }
}
