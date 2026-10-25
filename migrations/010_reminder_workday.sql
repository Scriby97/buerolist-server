-- Migration: Arbeitstagsdauer fuer die Erfassungserinnerung
-- Die Erinnerung kommt nur, wenn am Tag weniger als "workdayMinutes" erfasst
-- wurden (Default 8:00 = 480 Minuten). Wiederholbar.

ALTER TABLE public.entry_reminders
  ADD COLUMN IF NOT EXISTS "workdayMinutes" INTEGER NOT NULL DEFAULT 480;

ALTER TABLE public.entry_reminders
  DROP CONSTRAINT IF EXISTS chk_entry_reminders_workday_minutes;
ALTER TABLE public.entry_reminders
  ADD CONSTRAINT chk_entry_reminders_workday_minutes
  CHECK ("workdayMinutes" BETWEEN 1 AND 1440);

COMMENT ON COLUMN public.entry_reminders."workdayMinutes" IS
  'Dauer eines Arbeitstags in Minuten - Erinnerung nur, wenn heute weniger erfasst wurde.';
