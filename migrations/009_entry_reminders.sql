-- Migration: Erfassungserinnerung (taegliche Web-Push-Erinnerung, wie FleetTrack)
-- entry_reminders: pro User genau eine Zeile mit Erinnerungszeit/Status
--   (Default: aktiv, 17:30 Schweizer Zeit).
-- push_subscriptions: pro User beliebig viele Zeilen (ein Geraet/Browser =
--   eine Subscription).
-- Wiederholbar (IF NOT EXISTS / DROP POLICY IF EXISTS).

CREATE TABLE IF NOT EXISTS public.entry_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  "reminderTime" VARCHAR(5) NOT NULL DEFAULT '17:30',
  timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/Zurich',
  "lastSentAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_entry_reminders_user
    FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entry_reminders_enabled_time
  ON public.entry_reminders(enabled, "reminderTime");

COMMENT ON COLUMN public.entry_reminders."reminderTime" IS
  'Uhrzeit im Format HH:mm, ausgewertet in Europe/Zurich.';
COMMENT ON COLUMN public.entry_reminders."lastSentAt" IS
  'Letzter Versand - verhindert Doppel-Versand am selben Tag.';

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_push_subscriptions_user
    FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions("userId");

ALTER TABLE public.entry_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own entry reminder" ON public.entry_reminders;
CREATE POLICY "Users can manage their own entry reminder" ON public.entry_reminders
  FOR ALL
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions" ON public.push_subscriptions
  FOR ALL
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());
