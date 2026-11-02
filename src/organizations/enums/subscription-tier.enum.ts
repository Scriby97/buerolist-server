// Tarife nach Teamgroesse, Preise/Limits siehe SUBSCRIPTION_LIMITS.
export enum SubscriptionTier {
  FREE = 'free', // kostenlos - 2 Mitarbeiter, 10 aktive Projekte
  STANDARD = 'standard', // CHF 29.-/Monat - bis 10 Mitarbeiter
  PRO = 'pro', // CHF 69.-/Monat - unbegrenzt
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}
