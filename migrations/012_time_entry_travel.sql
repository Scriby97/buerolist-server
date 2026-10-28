-- Migration: Fahrzeit pro Zeiteintrag
-- Wird als Dezimalstunden erfasst (z.B. 1.25 h) und in Minuten gespeichert.
-- Zaehlt nicht zur Arbeitszeit (startAt/endAt), sondern wird separat summiert.
-- Wiederholbar.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS "travelMinutes" INTEGER;

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS chk_time_entries_travel_minutes;
ALTER TABLE public.time_entries
  ADD CONSTRAINT chk_time_entries_travel_minutes
  CHECK ("travelMinutes" IS NULL OR "travelMinutes" BETWEEN 0 AND 1440);

COMMENT ON COLUMN public.time_entries."travelMinutes" IS
  'Fahrzeit in Minuten (Eingabe als Dezimalstunden), separat von der Arbeitszeit.';
