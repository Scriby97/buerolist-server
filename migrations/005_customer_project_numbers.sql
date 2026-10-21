-- Fortlaufende Nummern: Kunden pro Organisation (001, 002, ...), Projekte pro
-- Kunde (001-01, 001-02, ...). Neue Nummern vergibt das Backend als
-- "hoechste bisherige + 1" (geloeschte Nummern werden nicht wiederverwendet).
--
-- WICHTIG: VOR dem Deploy des Backends ausfuehren, das die Spalten "number"
-- liest/schreibt.
--
-- Bestehende Kunden/Projekte werden einmalig nach Erstelldatum nummeriert.
-- Das Skript ist wiederholbar (bereits gesetzte Nummern bleiben, Constraints
-- werden nur angelegt, wenn sie fehlen).

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS number INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", id) AS rn
  FROM public.customers
)
UPDATE public.customers c
SET number = numbered.rn
FROM numbered
WHERE c.id = numbered.id AND c.number IS NULL;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "customerId" ORDER BY "createdAt", id) AS rn
  FROM public.projects
)
UPDATE public.projects p
SET number = numbered.rn
FROM numbered
WHERE p.id = numbered.id AND p.number IS NULL;

ALTER TABLE public.customers ALTER COLUMN number SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customers_organization_number') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT uq_customers_organization_number UNIQUE ("organizationId", number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_projects_customer_number') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT uq_projects_customer_number UNIQUE ("customerId", number);
  END IF;
END $$;
