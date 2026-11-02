import { SubscriptionTier } from '../enums/subscription-tier.enum';

export interface SubscriptionLimits {
  maxProjects: number | null; // aktive Projekte, null = unlimitiert
  maxMembers: number | null; // null = unlimitiert
  maxCustomers: number | null; // null = unlimitiert
  priceChf: number;
}

// Abgestuft nach Teamgroesse (Mitarbeiter inkl. solche ohne Login); Kunden
// sind in keinem Tarif begrenzt. Muss zu lib/subscriptionPlans.ts im
// Frontend passen.
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> =
  {
    [SubscriptionTier.FREE]: {
      maxProjects: 10,
      maxMembers: 2,
      maxCustomers: null,
      priceChf: 0,
    },
    [SubscriptionTier.STANDARD]: {
      maxProjects: null,
      maxMembers: 10,
      maxCustomers: null,
      priceChf: 29,
    },
    [SubscriptionTier.PRO]: {
      maxProjects: null,
      maxMembers: null,
      maxCustomers: null,
      priceChf: 69,
    },
  };

/** Bezahlte Tarife mit dem Namen ihrer Stripe-Price-Umgebungsvariable. */
export const STRIPE_PRICE_ENV: Partial<Record<SubscriptionTier, string>> = {
  [SubscriptionTier.STANDARD]: 'STRIPE_PRICE_STANDARD',
  [SubscriptionTier.PRO]: 'STRIPE_PRICE_PRO',
};
