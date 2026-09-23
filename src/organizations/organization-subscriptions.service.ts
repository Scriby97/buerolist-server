import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import { OrganizationMembersService } from './organization-members.service';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectStatus } from '../projects/project-status.enum';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';
import {
  SubscriptionTier,
  SubscriptionStatus,
} from './enums/subscription-tier.enum';
import {
  SUBSCRIPTION_LIMITS,
  SubscriptionLimits,
} from './constants/subscription-limits.constant';

export interface FreeLimitStatus {
  overLimit: boolean;
  projectCount: number;
  memberCount: number;
}

@Injectable()
export class OrganizationSubscriptionsService {
  private readonly logger = new Logger(OrganizationSubscriptionsService.name);

  constructor(
    @InjectRepository(OrganizationSubscriptionEntity)
    private readonly subscriptionRepository: Repository<OrganizationSubscriptionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    private readonly membersService: OrganizationMembersService,
  ) {}

  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) {
      throw new AppNotFoundException(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'No subscription found for this organization',
      );
    }

    return subscription;
  }

  /**
   * Die Tarif-Limits (maxProjects/maxMembers) der aktuellen Subscription einer
   * Organisation - für die Durchsetzung beim Anlegen von Projekten/Invites.
   */
  async getLimits(organizationId: string): Promise<SubscriptionLimits> {
    const subscription = await this.findByOrganization(organizationId);
    return SUBSCRIPTION_LIMITS[subscription.tier];
  }

  /**
   * Für Stripe-Webhooks, die keine organizationId mitliefern (z.B. wenn die
   * Subscription über den Customer Portal statt über unseren eigenen Flow
   * geändert wurde) - Lookup über die eindeutige stripeSubscriptionId-Spalte
   * als Fallback zu den Subscription-Metadaten.
   */
  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<OrganizationSubscriptionEntity | null> {
    return this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId },
    });
  }

  /**
   * Legt die Free-Subscription für eine neu erstellte Organisation an
   */
  async createDefault(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = this.subscriptionRepository.create({
      organizationId,
      tier: SubscriptionTier.FREE,
      status: SubscriptionStatus.ACTIVE,
    });
    return this.subscriptionRepository.save(subscription);
  }

  async updateTier(
    organizationId: string,
    tier: SubscriptionTier,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = tier;
    subscription.status = SubscriptionStatus.ACTIVE;
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Legt eine Subscription direkt auf einem bezahlten Tier an (statt erst auf
   * Free und dann upzugraden) - für die Selfservice-Organisationserstellung,
   * bei der die Organisation selbst erst nach erfolgreicher Zahlung entsteht.
   */
  async createPaid(
    organizationId: string,
    tier: SubscriptionTier,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = this.subscriptionRepository.create({
      organizationId,
      tier,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId,
      stripeSubscriptionId,
    });
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Aktiviert einen bezahlten Tier nach erfolgreichem Stripe Checkout (Webhook)
   */
  async activatePaidTier(
    organizationId: string,
    tier: SubscriptionTier,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = tier;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.stripeCustomerId = stripeCustomerId;
    subscription.stripeSubscriptionId = stripeSubscriptionId;
    const saved = await this.subscriptionRepository.save(subscription);

    // Zahlt dieselbe Organisation wieder, kommen wegen Nichtzahlung
    // archivierte Mitglieder/Projekte automatisch zurück (siehe
    // downgradeToFree). Ist nichts archiviert, sind das No-Ops.
    await Promise.all([
      this.membersService.restoreArchivedMembers(organizationId),
      this.projectRepository.update(
        { organizationId, archivedAt: Not(IsNull()) },
        { archivedAt: null },
      ),
    ]);

    return saved;
  }

  /**
   * Übernimmt Tier/Status/Laufzeit aus einem customer.subscription.updated Webhook.
   * status wird von Stripes granularerem Subscription-Status auf unsere drei
   * Werte (active/past_due/canceled) abgebildet - unbekannte/andere Stripe-Status
   * (z.B. "incomplete", "trialing") werden konservativ als "active" behandelt,
   * da der Zugriff in diesen Fällen normalerweise nicht sofort entzogen werden soll.
   */
  async syncFromStripeSubscription(
    organizationId: string,
    tier: SubscriptionTier,
    stripeStatus: string,
    currentPeriodStart?: Date,
    currentPeriodEnd?: Date,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = tier;
    subscription.status =
      stripeStatus === 'past_due' || stripeStatus === 'unpaid'
        ? SubscriptionStatus.PAST_DUE
        : stripeStatus === 'canceled'
          ? SubscriptionStatus.CANCELED
          : SubscriptionStatus.ACTIVE;
    if (currentPeriodStart)
      subscription.currentPeriodStart = currentPeriodStart;
    if (currentPeriodEnd) subscription.currentPeriodEnd = currentPeriodEnd;
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Zahlung fehlgeschlagen (invoice.payment_failed): Status auf past_due setzen,
   * Tier bewusst NICHT sofort herabstufen - Stripes Smart Retries geben dem Kunden
   * eine Kulanzfrist, in der er seine Zahlungsmethode aktualisieren kann.
   */
  async markPastDue(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.status = SubscriptionStatus.PAST_DUE;
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * customer.subscription.deleted: die Stripe-Subscription existiert nicht mehr
   * (endgültig gekündigt oder nach wiederholt fehlgeschlagenen Zahlungen storniert).
   * Organisation fällt zurück auf den Free-Tarif - stripeCustomerId und die
   * (jetzt inaktive) stripeSubscriptionId bleiben als historischer Verweis erhalten
   * (für ein späteres Re-Upgrade legt createCheckoutSession bei Bedarf ohnehin eine
   * neue Subscription an; TypeORM würde ein explizites `undefined` beim Löschen
   * still ignorieren statt NULL zu speichern, daher hier bewusst nicht geleert).
   *
   * Liegt die Organisation zu diesem Zeitpunkt über dem kostenlosen Free-Limit
   * (mehr aktive Projekte oder Mitarbeiter als erlaubt), werden zusätzlich alle
   * Mitgliedschaften ausser dem Owner sowie alle Projekte archiviert (siehe
   * OrganizationMembersService.archiveMembersExceptOwner) - die Organisation
   * und alle ihre Daten bleiben dabei vollständig erhalten, nur der Zugriff
   * geht verloren. Der Owner bleibt bewusst Mitglied, damit er sich weiterhin
   * einloggen und die Organisation durch erneute Zahlung wiederherstellen
   * kann (siehe activatePaidTier). Der Live-Check hier (statt zum Zeitpunkt
   * der Kündigung) ist bewusst: reduziert der Owner die Anzahl vor Ablauf der
   * Abrechnungsperiode selbst wieder unters Limit (z.B. Projekte
   * abschliessen), bleibt die Organisation verbunden.
   */
  async downgradeToFree(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = SubscriptionTier.FREE;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.canceledAt = new Date();
    const saved = await this.subscriptionRepository.save(subscription);

    const limitStatus = await this.getFreeLimitStatus(organizationId);
    if (limitStatus.overLimit) {
      await Promise.all([
        this.membersService.archiveMembersExceptOwner(organizationId),
        this.projectRepository.update(
          { organizationId, archivedAt: IsNull() },
          { archivedAt: new Date() },
        ),
      ]);
      this.logger.warn(
        `Organisation ${organizationId} lag beim Downgrade auf Free über dem Free-Limit ` +
          `(Projekte=${limitStatus.projectCount}, Mitarbeiter=${limitStatus.memberCount}) - ` +
          `Mitglieder (ausser Owner) und Projekte archiviert, Daten bleiben erhalten.`,
      );
    }

    return saved;
  }

  /**
   * Prüft, ob eine Organisation aktuell mehr aktive Projekte oder Mitarbeiter
   * hat, als der kostenlose Free-Tarif erlaubt - fürs Frontend (Warnung vor
   * dem Kündigen) und für downgradeToFree() (tatsächliche Durchsetzung).
   * Abgeschlossene Projekte zählen bewusst nicht mit.
   */
  async getFreeLimitStatus(organizationId: string): Promise<FreeLimitStatus> {
    const freeLimits = SUBSCRIPTION_LIMITS[SubscriptionTier.FREE];

    const [projectCount, memberCount] = await Promise.all([
      this.projectRepository.count({
        where: {
          organizationId,
          status: ProjectStatus.ACTIVE,
          archivedAt: IsNull(),
        },
      }),
      this.membersService.countByOrganization(organizationId),
    ]);

    const overLimit =
      (freeLimits.maxProjects !== null &&
        projectCount > freeLimits.maxProjects) ||
      (freeLimits.maxMembers !== null && memberCount > freeLimits.maxMembers);

    return { overLimit, projectCount, memberCount };
  }
}
