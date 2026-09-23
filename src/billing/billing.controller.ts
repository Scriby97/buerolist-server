import { Controller, Post, Req, Headers, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionTier } from '../organizations/enums/subscription-tier.enum';
import { Public } from '../auth/decorators/public.decorator';
import { AppBadRequestException, ErrorCode } from '../common/exceptions';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /**
   * POST /billing/webhook
   * Stripe Webhook - hält den Subscription-Status der Organisation mit Stripe synchron
   * PUBLIC - Authentifizierung erfolgt über die Stripe-Signatur, nicht per Bearer Token
   */
  @Public()
  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'Fehlende Stripe-Signatur',
      );
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'Raw Body nicht verfügbar',
      );
    }

    const event = this.stripeService.constructEvent(rawBody, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        // Andere Event-Typen (z.B. invoice.paid) sind aktuell nicht relevant für uns.
        break;
    }

    return { received: true };
  }

  /**
   * Checkout abgeschlossen (erste Zahlung bestätigt). Zwei Fälle, unterschieden
   * über die Metadaten:
   * - metadata.organizationId gesetzt: bestehende Organisation wird auf den
   *   bezahlten Tier hochgestuft (Upgrade-Flow über Settings).
   * - metadata.pendingOrgName gesetzt: die Organisation existiert noch gar nicht
   *   und wird jetzt, mit bestätigter Zahlung, zum ersten Mal angelegt
   *   (Selfservice-Erstellung mit bezahltem Tier).
   */
  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const tier = session.metadata?.tier as SubscriptionTier | undefined;
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : undefined;
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : undefined;

    if (!tier) {
      this.logger.warn(
        `checkout.session.completed ohne tier: sessionId=${session.id}`,
      );
      return;
    }

    const organizationId = session.metadata?.organizationId;
    const pendingOrgName = session.metadata?.pendingOrgName;

    if (organizationId) {
      await this.subscriptionsService.activatePaidTier(
        organizationId,
        tier,
        stripeCustomerId ?? '',
        stripeSubscriptionId ?? '',
      );

      this.logger.log(
        `Subscription aktiviert: organizationId=${organizationId} tier=${tier}`,
      );
      return;
    }

    if (pendingOrgName) {
      const ownerUserId = session.metadata?.ownerUserId;
      if (!ownerUserId) {
        this.logger.error(
          `checkout.session.completed mit pendingOrgName aber ohne ownerUserId: sessionId=${session.id}`,
        );
        return;
      }

      const { organization } =
        await this.organizationsService.createFromStripeCheckout({
          name: pendingOrgName,
          subdomain: session.metadata?.pendingOrgSubdomain || undefined,
          contactEmail: session.metadata?.pendingOrgContactEmail || undefined,
          ownerUserId,
          tier,
          stripeCustomerId: stripeCustomerId ?? '',
          stripeSubscriptionId: stripeSubscriptionId ?? '',
        });

      this.logger.log(
        `Organisation nach Zahlung angelegt: organizationId=${organization.id} name=${pendingOrgName} tier=${tier}`,
      );
      return;
    }

    this.logger.warn(
      `checkout.session.completed ohne organizationId/pendingOrgName: sessionId=${session.id}`,
    );
  }

  /**
   * Plan-/Status-Wechsel einer bestehenden Subscription (Upgrade, Downgrade,
   * Proration, oder von Stripe erkannter Zahlungsstatus wie past_due). Deckt
   * sowohl Änderungen über unseren eigenen Flow als auch über das Stripe
   * Customer Portal ab.
   */
  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = await this.resolveOrganizationId(subscription);
    if (!organizationId) {
      this.logger.warn(
        `customer.subscription.updated ohne zuordenbare Organisation: subscriptionId=${subscription.id}`,
      );
      return;
    }

    const item = subscription.items.data[0];
    const priceId = item?.price?.id;
    const tier =
      this.stripeService.getTierForPriceId(priceId) ??
      (subscription.metadata?.tier as SubscriptionTier | undefined);

    if (!tier) {
      this.logger.warn(
        `customer.subscription.updated ohne zuordenbaren Tier: subscriptionId=${subscription.id} priceId=${priceId}`,
      );
      return;
    }

    // Ab dieser Stripe-API-Version sitzt current_period_start/end nicht mehr
    // direkt auf der Subscription, sondern pro Subscription-Item (siehe
    // SubscriptionItems.d.ts) - wie priceId oben vom ersten Item gelesen.
    await this.subscriptionsService.syncFromStripeSubscription(
      organizationId,
      tier,
      subscription.status,
      item ? new Date(item.current_period_start * 1000) : undefined,
      item ? new Date(item.current_period_end * 1000) : undefined,
    );

    this.logger.log(
      `Subscription synchronisiert: organizationId=${organizationId} tier=${tier} status=${subscription.status}`,
    );
  }

  /**
   * Subscription endgültig beendet (Kündigung zum Periodenende wirksam geworden,
   * oder nach wiederholt fehlgeschlagenen Zahlungen von Stripe storniert).
   */
  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = await this.resolveOrganizationId(subscription);
    if (!organizationId) {
      this.logger.warn(
        `customer.subscription.deleted ohne zuordenbare Organisation: subscriptionId=${subscription.id}`,
      );
      return;
    }

    await this.subscriptionsService.downgradeToFree(organizationId);

    this.logger.log(
      `Subscription beendet, zurück auf Lieutenant: organizationId=${organizationId}`,
    );
  }

  /**
   * Zahlung (Renewal oder Erstzahlung) fehlgeschlagen. Stripe versucht es gemäß
   * Smart Retries automatisch erneut; wir markieren die Organisation in der
   * Zwischenzeit als past_due (Zugriff bleibt bestehen, kann im Frontend aber
   * z.B. für einen Hinweisbanner genutzt werden).
   */
  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    // Stripe hat den Ort von "welche Subscription gehört zu dieser Invoice" über
    // API-Versionen hinweg verschoben (früher invoice.subscription, neuere Versionen
    // invoice.parent.subscription_details.subscription) - defensiv beide Formen lesen,
    // statt uns auf ein bestimmtes stripe-node-Typing festzulegen.
    const legacySubscriptionRef = (
      invoice as unknown as { subscription?: unknown }
    ).subscription;
    const parentSubscriptionRef = (
      invoice as unknown as {
        parent?: { subscription_details?: { subscription?: unknown } };
      }
    ).parent?.subscription_details?.subscription;
    const subscriptionRef = legacySubscriptionRef ?? parentSubscriptionRef;
    const subscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : (subscriptionRef as { id?: string } | undefined)?.id;

    if (!subscriptionId) {
      return;
    }

    const existing =
      await this.subscriptionsService.findByStripeSubscriptionId(
        subscriptionId,
      );

    if (!existing) {
      this.logger.warn(
        `invoice.payment_failed ohne zuordenbare Organisation: subscriptionId=${subscriptionId}`,
      );
      return;
    }

    await this.subscriptionsService.markPastDue(existing.organizationId);

    this.logger.warn(
      `Zahlung fehlgeschlagen: organizationId=${existing.organizationId} subscriptionId=${subscriptionId}`,
    );
  }

  /**
   * organizationId primär aus den Subscription-Metadaten (von createCheckoutSession
   * gesetzt), als Fallback über die eindeutige stripeSubscriptionId-Spalte - deckt
   * z.B. Subscriptions ab, die vor Einführung der Metadaten entstanden sind.
   */
  private async resolveOrganizationId(
    subscription: Stripe.Subscription,
  ): Promise<string | null> {
    const metaOrgId = subscription.metadata?.organizationId;
    if (metaOrgId) {
      return metaOrgId;
    }
    const existing = await this.subscriptionsService.findByStripeSubscriptionId(
      subscription.id,
    );
    return existing?.organizationId ?? null;
  }
}
