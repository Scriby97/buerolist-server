// Platzhalter-Tarife - Namen/Preise/Limits sind bewusst noch nicht final,
// siehe SUBSCRIPTION_LIMITS. Struktur (zwei Tarife statt FleetTracks drei)
// ist einfach um weitere Tarife erweiterbar, ohne Guards/Billing-Code anzufassen.
export enum SubscriptionTier {
  FREE = 'free', // kostenlos - begrenzt auf wenige aktive Projekte/Mitglieder
  PRO = 'pro', // CHF 39.-/Monat (Platzhalter) - unlimitiert
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}
