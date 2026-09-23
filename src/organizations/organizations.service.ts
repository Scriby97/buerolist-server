import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import { ProjectEntity } from '../projects/project.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateSelfServiceOrganizationDto } from './dto/create-self-service-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationSubscriptionsService } from './organization-subscriptions.service';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationRole } from '../auth/enums/user-role.enum';
import { SubscriptionTier } from './enums/subscription-tier.enum';
import {
  AppBadRequestException,
  AppConflictException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    // Nur fuer die Projekt-Archivierung in deleteByOwner - gleiches Inline-
    // Muster wie OrganizationSubscriptionsService.downgradeToFree, kein
    // voller ProjectsService-Import noetig.
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    private readonly invitesService: OrganizationsInvitesService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  /**
   * Erstellt eine neue Organization und einen Invite für den ersten Admin
   */
  async create(
    createOrganizationDto: CreateOrganizationDto,
  ): Promise<{ organization: OrganizationEntity; inviteToken: string }> {
    // 1. Erstelle Organization
    const organization = this.organizationRepository.create({
      name: createOrganizationDto.name,
      subdomain: createOrganizationDto.subdomain,
      contactEmail: createOrganizationDto.contactEmail,
    });
    const savedOrganization =
      await this.organizationRepository.save(organization);

    // 2. Erstelle Free-Subscription für die neue Organisation
    await this.subscriptionsService.createDefault(savedOrganization.id);

    // 3. Erstelle Invite für ersten Admin
    const invite = await this.invitesService.createInvite(
      savedOrganization.id,
      {
        email: createOrganizationDto.adminEmail,
        role: createOrganizationDto.adminRole || OrganizationRole.ADMIN,
      },
      undefined, // invitedBy (wird vom System erstellt, nicht von einem User)
    );

    return {
      organization: savedOrganization,
      inviteToken: invite.token,
    };
  }

  /**
   * Erstellt eine Organization im Self-Service (durch einen normalen User).
   * Der User wird sofort als Owner eingetragen, die Organisation startet immer
   * auf dem kostenlosen Free-Tier - ein bezahlter Tier wird erst nach
   * erfolgreichem Stripe-Checkout (Webhook) aktiviert.
   */
  async createSelfService(
    dto: CreateSelfServiceOrganizationDto,
    ownerUserId: string,
  ): Promise<{
    organization: OrganizationEntity;
    subscription: OrganizationSubscriptionEntity;
  }> {
    const organization = this.organizationRepository.create({
      name: dto.name,
      subdomain: dto.subdomain,
      contactEmail: dto.contactEmail,
    });

    let savedOrganization: OrganizationEntity;
    try {
      savedOrganization = await this.organizationRepository.save(organization);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppConflictException(
          ErrorCode.ORG_NAME_TAKEN,
          'Eine Organisation mit diesem Namen existiert bereits',
        );
      }
      throw error;
    }

    const subscription = await this.subscriptionsService.createDefault(
      savedOrganization.id,
    );

    await this.membersService.addOwner(savedOrganization.id, ownerUserId);

    return { organization: savedOrganization, subscription };
  }

  /**
   * Wirft einen Fehler, falls der Name bereits vergeben ist. Wird vor dem
   * Erstellen einer Stripe Checkout Session für einen bezahlten Tier genutzt,
   * damit User nicht erst bezahlen und danach an der Namens-Kollision scheitern.
   * Schließt eine seltene Race Condition (Name wird zwischen diesem Check und dem
   * Checkout-Abschluss vergeben) nicht aus - das wird in createFromStripeCheckout
   * separat abgefangen.
   */
  async assertNameAvailable(name: string): Promise<void> {
    const existing = await this.organizationRepository.findOne({
      where: { name },
    });
    if (existing) {
      throw new AppConflictException(
        ErrorCode.ORG_NAME_TAKEN,
        'Eine Organisation mit diesem Namen existiert bereits',
      );
    }
  }

  /**
   * Erstellt eine Organisation NACH erfolgreichem Stripe-Checkout für einen
   * bezahlten Tier (aufgerufen aus dem Webhook). Im Gegensatz zu createSelfService
   * wird hier direkt der bezahlte Tier gesetzt statt erst Lieutenant anzulegen -
   * die Organisation existiert bis zu diesem Zeitpunkt überhaupt noch nicht in
   * der DB, damit ein abgebrochener/fehlgeschlagener Checkout keine "Karteileiche"
   * hinterlässt.
   */
  async createFromStripeCheckout(params: {
    name: string;
    subdomain?: string;
    contactEmail?: string;
    ownerUserId: string;
    tier: SubscriptionTier;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }): Promise<{
    organization: OrganizationEntity;
    subscription: OrganizationSubscriptionEntity;
  }> {
    const organization = this.organizationRepository.create({
      name: params.name,
      subdomain: params.subdomain,
      contactEmail: params.contactEmail,
    });

    let savedOrganization: OrganizationEntity;
    try {
      savedOrganization = await this.organizationRepository.save(organization);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        // Seltene Race Condition: Name wurde zwischen Checkout-Start und
        // erfolgreicher Zahlung von jemand anderem vergeben. Die Zahlung ist
        // zu diesem Zeitpunkt bereits erfolgt - das erfordert manuelles Klären
        // (Rückerstattung oder anderer Name), daher lauter Log statt stillem Fehlschlag.
        throw new AppConflictException(
          ErrorCode.ORG_NAME_TAKEN_AFTER_PAYMENT,
          `Zahlung erfolgreich, aber Organisationsname "${params.name}" wurde zwischenzeitlich vergeben ` +
            `(ownerUserId=${params.ownerUserId}, stripeCustomerId=${params.stripeCustomerId}, ` +
            `stripeSubscriptionId=${params.stripeSubscriptionId}) - erfordert manuelle Klärung`,
        );
      }
      throw error;
    }

    const subscription = await this.subscriptionsService.createPaid(
      savedOrganization.id,
      params.tier,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
    );

    await this.membersService.addOwner(
      savedOrganization.id,
      params.ownerUserId,
    );

    return { organization: savedOrganization, subscription };
  }

  /**
   * Für die Admin-Organisationsübersicht: Abo-Status/Tarif und Owner-Kontakt
   * gleich mitliefern, damit ein Admin bei hängenden past_due-Fällen manuell
   * nachfassen kann (solange es noch keinen automatischen E-Mail-Versand
   * gibt).
   */
  async findAll(): Promise<
    (OrganizationEntity & { owner: { email: string; name?: string } | null })[]
  > {
    const organizations = await this.organizationRepository.find({
      where: { isActive: true },
      relations: ['subscription'],
    });
    const owners = await this.membersService.findOwners(
      organizations.map((org) => org.id),
    );
    return organizations.map((org) => ({
      ...org,
      owner: owners.get(org.id) ?? null,
    }));
  }

  async findOne(id: string): Promise<OrganizationEntity> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new AppNotFoundException(
        ErrorCode.ORGANIZATION_NOT_FOUND,
        `Organization with ID ${id} not found`,
        { id },
      );
    }

    return organization;
  }

  async update(
    id: string,
    updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<OrganizationEntity> {
    const organization = await this.findOne(id);
    Object.assign(organization, updateOrganizationDto);
    return await this.organizationRepository.save(organization);
  }

  async remove(id: string): Promise<void> {
    const organization = await this.findOne(id);
    organization.isActive = false;
    await this.organizationRepository.save(organization);
  }

  /**
   * Der Owner löscht seine eigene Organisation (Soft-Delete). Archiviert alle
   * Mitgliedschaften (inklusive Owner - dadurch verliert er über den
   * OrganizationGuard sofort selbst den Zugriff, siehe
   * OrganizationMembersService.archiveAllMembers) sowie alle Projekte. Die
   * Organisation selbst bleibt bestehen (isActive bleibt true) und ist damit
   * für globale Administratoren weiterhin sichtbar (siehe findAll) - sie
   * sehen an "deletionRequestedAt", dass der Owner die Organisation zur
   * Löschung freigegeben hat, und können sie über hardDelete endgültig
   * entfernen.
   */
  async deleteByOwner(organizationId: string): Promise<void> {
    const organization = await this.findOne(organizationId);

    await Promise.all([
      this.membersService.archiveAllMembers(organizationId),
      this.projectRepository.update(
        { organizationId, archivedAt: IsNull() },
        { archivedAt: new Date() },
      ),
    ]);

    organization.deletionRequestedAt = new Date();
    await this.organizationRepository.save(organization);
  }

  /**
   * Löscht eine Organisation endgültig (nur globale Administratoren, nur
   * nachdem der Owner sie selbst über deleteByOwner zur Löschung freigegeben
   * hat - siehe deletionRequestedAt-Check unten als Sicherheitsschranke).
   * Mitglieder, Projekte (und darüber kaskadierend Zeiteinträge/Notizen) sowie
   * die Subscription haben ON DELETE CASCADE und werden automatisch mitgelöscht;
   * Einladungen haben das nicht und müssen vorher explizit entfernt werden
   * (siehe OrganizationsInvitesService.deleteAllForOrganization).
   */
  async hardDelete(id: string): Promise<void> {
    const organization = await this.findOne(id);

    if (!organization.deletionRequestedAt) {
      throw new AppBadRequestException(
        ErrorCode.ORG_DELETION_NOT_REQUESTED,
        'Diese Organisation wurde nicht vom Owner zur Löschung freigegeben',
      );
    }

    await this.invitesService.deleteAllForOrganization(id);
    await this.organizationRepository.remove(organization);
  }

  /**
   * Selfservice-Bearbeitung durch den Org-Owner (aktuell nur der Name).
   * Namens-Kollision (unique constraint, Postgres 23505) wird wie in
   * createSelfService in einen sprechenden Konflikt-Fehler uebersetzt.
   */
  async updateProfile(
    id: string,
    dto: { name?: string },
  ): Promise<OrganizationEntity> {
    const organization = await this.findOne(id);

    if (dto.name !== undefined) {
      organization.name = dto.name.trim();
    }

    try {
      return await this.organizationRepository.save(organization);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppConflictException(
          ErrorCode.ORG_NAME_TAKEN,
          'Eine Organisation mit diesem Namen existiert bereits',
        );
      }
      throw error;
    }
  }

  async setLogoUrl(
    id: string,
    logoUrl: string | null,
  ): Promise<OrganizationEntity> {
    const organization = await this.findOne(id);
    organization.logoUrl = logoUrl;
    return this.organizationRepository.save(organization);
  }
}
