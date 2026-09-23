import { SubscriptionTier } from '../enums/subscription-tier.enum';

export interface SubscriptionLimits {
  maxProjects: number | null; // aktive Projekte, null = unlimitiert
  maxMembers: number | null; // null = unlimitiert
  priceChf: number;
}

// Platzhalter-Limits, siehe subscription-tier.enum.ts.
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> =
  {
    [SubscriptionTier.FREE]: {
      maxProjects: 1,
      maxMembers: 2,
      priceChf: 0,
    },
    [SubscriptionTier.PRO]: {
      maxProjects: null,
      maxMembers: null,
      priceChf: 39,
    },
  };
