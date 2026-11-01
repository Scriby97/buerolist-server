-- Migration: Abwesenheitsgruende nummeriert, Ferien als Default, eigener Grund
-- (setzt migrations/015 voraus)
--
-- - Gruende erhalten eine fortlaufende Nummer pro Organisation, angezeigt als
--   A-001, A-002, ... (ersetzt "sortOrder").
-- - Default-Gruende jeder Organisation:
--     A-001 Krankheit, A-002 Unfall, A-003 Militär/Zivilschutz,
--     A-004 Feuerwehr, A-005 Ferien
--   Bestehende Organisationen erhalten "Ferien" mit der naechsten Nummer.
-- - Abwesenheiten koennen statt eines vordefinierten Grunds einen frei
--   eingegebenen haben ("reasonText", dann ohne reasonId).
-- Wiederholbar.

-- Nummer statt Reihenfolge
ALTER TABLE public.absence_reasons ADD COLUMN IF NOT EXISTS number INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'absence_reasons' AND column_name = 'sortOrder'
  ) THEN
    UPDATE public.absence_reasons r
    SET number = n.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "sortOrder", "createdAt") AS rn
      FROM public.absence_reasons
    ) n
    WHERE r.id = n.id AND r.number IS NULL;
    ALTER TABLE public.absence_reasons DROP COLUMN "sortOrder";
  END IF;
END $$;

ALTER TABLE public.absence_reasons ALTER COLUMN number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_absence_reasons_org_number') THEN
    ALTER TABLE public.absence_reasons
      ADD CONSTRAINT uq_absence_reasons_org_number UNIQUE ("organizationId", number);
  END IF;
END $$;

-- Ferien fuer bestehende Organisationen (falls noch nicht vorhanden)
INSERT INTO public.absence_reasons ("organizationId", name, number)
SELECT o.id, 'Ferien', COALESCE((
  SELECT MAX(r.number) FROM public.absence_reasons r WHERE r."organizationId" = o.id
), 0) + 1
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.absence_reasons r WHERE r."organizationId" = o.id AND r.name = 'Ferien'
);

-- Default-Gruende fuer neue Organisationen
CREATE OR REPLACE FUNCTION public.seed_absence_reasons() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.absence_reasons ("organizationId", name, number)
  VALUES
    (NEW.id, 'Krankheit', 1),
    (NEW.id, 'Unfall', 2),
    (NEW.id, 'Militär/Zivilschutz', 3),
    (NEW.id, 'Feuerwehr', 4),
    (NEW.id, 'Ferien', 5)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eigener Grund (frei eingegeben) statt eines vordefinierten
ALTER TABLE public.absences ADD COLUMN IF NOT EXISTS "reasonText" VARCHAR(100);
ALTER TABLE public.absences ALTER COLUMN "reasonId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_absences_reason') THEN
    ALTER TABLE public.absences
      ADD CONSTRAINT chk_absences_reason CHECK ("reasonId" IS NOT NULL OR "reasonText" IS NOT NULL);
  END IF;
END $$;
