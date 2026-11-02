-- Projektnummern mit Jahr: Kunde-Jahr-Nummer, z.B. 016-26-01. Die Nummer
-- zaehlt pro Kunde UND Jahr und beginnt jedes Jahr wieder bei 01.
--
-- WICHTIG: VOR dem Deploy des Backends ausfuehren, das die Spalte "year"
-- liest/schreibt.
--
-- Bestehende Projekte bekommen das Jahr ihres Erstelldatums (Schweizer Zeit),
-- ihre Nummer bleibt unveraendert (016-01 -> 016-26-01). Das Skript ist
-- wiederholbar.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS year SMALLINT;

UPDATE public.projects
SET year = EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'Europe/Zurich'))::SMALLINT
WHERE year IS NULL;

ALTER TABLE public.projects ALTER COLUMN year SET NOT NULL;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS uq_projects_customer_number;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_projects_customer_year_number') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT uq_projects_customer_year_number UNIQUE ("customerId", year, number);
  END IF;
END $$;
