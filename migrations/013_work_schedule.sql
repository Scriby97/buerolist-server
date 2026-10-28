-- Migration: Normaler Arbeitstag pro Mitarbeiter
-- Vier Zeiten (Vormittag von/bis, Nachmittag von/bis, "HH:mm"). Daraus:
-- - Startzeit-Vorschlag beim Erfassen (Tagesbeginn bzw. nach der Mittagspause)
-- - Dauer eines normalen Arbeitstags fuer die Erfassungserinnerung
--   (ersetzt entry_reminders."workdayMinutes", das nicht mehr verwendet wird).
-- Default: 07:15-12:00, 13:00-17:00. Wiederholbar.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS "workMorningStart" VARCHAR(5) NOT NULL DEFAULT '07:15',
  ADD COLUMN IF NOT EXISTS "workMorningEnd" VARCHAR(5) NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS "workAfternoonStart" VARCHAR(5) NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS "workAfternoonEnd" VARCHAR(5) NOT NULL DEFAULT '17:00';

COMMENT ON COLUMN public.user_profiles."workMorningStart" IS
  'Normaler Arbeitstag: Beginn Vormittag (HH:mm, Europe/Zurich).';
