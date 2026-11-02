-- Migration: Dritter Tarif "standard" (zwischen free und pro)
--
-- Tarife nach Teamgroesse (Limits/Preise siehe SUBSCRIPTION_LIMITS im Code):
--   free      CHF 0      2 Mitarbeiter, 10 aktive Projekte
--   standard  CHF 29/Mt  bis 10 Mitarbeiter
--   pro       CHF 69/Mt  bis 30 Mitarbeiter
-- Wiederholbar.

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS chk_org_subscriptions_tier;
ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT chk_org_subscriptions_tier CHECK (tier IN ('free', 'standard', 'pro'));

COMMENT ON COLUMN public.organization_subscriptions.tier IS
  'Stabiler Plan-Key: free, standard oder pro. Limits/Preise siehe SUBSCRIPTION_LIMITS im Code.';
