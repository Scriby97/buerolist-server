-- Hauptkategorien: frei benennbare Gruppen (z.B. "Malerarbeiten",
-- "Bodenbelagsarbeiten", "Diverses"), nummeriert pro Organisation (1, 2, 3).
-- Jede Kategorie gehoert zu genau einer Hauptkategorie und ist darin
-- nummeriert - angezeigt als "1.01", "1.02", "2.01" ...
--
-- WICHTIG: VOR dem Deploy des Backends ausfuehren, das diese Spalten liest.
--
-- Bestehende Kategorien landen in einer Hauptkategorie "Allgemein" (Nr. 1)
-- und werden alphabetisch nummeriert. In den Einstellungen lassen sie sich
-- danach in andere Hauptkategorien verschieben. Wiederholbar.

CREATE TABLE IF NOT EXISTS public.category_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  number INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_category_groups_organization
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT uq_category_groups_organization_number UNIQUE ("organizationId", number)
);
CREATE INDEX IF NOT EXISTS idx_category_groups_organization ON public.category_groups("organizationId");
ALTER TABLE public.category_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS "groupId" UUID;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS number INTEGER;

-- Hauptkategorie "Allgemein" fuer jede Organisation mit noch nicht
-- zugeordneten Kategorien (falls sie noch keine Hauptkategorie hat).
INSERT INTO public.category_groups ("organizationId", number, name)
SELECT DISTINCT c."organizationId", 1, 'Allgemein'
FROM public.categories c
WHERE c."groupId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.category_groups g WHERE g."organizationId" = c."organizationId"
  );

-- Nicht zugeordnete Kategorien in die erste Hauptkategorie ihrer Organisation.
UPDATE public.categories c
SET "groupId" = g.id
FROM public.category_groups g
WHERE c."groupId" IS NULL
  AND g."organizationId" = c."organizationId"
  AND g.number = (
    SELECT MIN(g2.number) FROM public.category_groups g2 WHERE g2."organizationId" = c."organizationId"
  );

-- Nummern innerhalb der Hauptkategorie, alphabetisch, nach bereits vergebenen.
WITH numbered AS (
  SELECT c.id,
         COALESCE((SELECT MAX(c2.number) FROM public.categories c2 WHERE c2."groupId" = c."groupId"), 0)
           + ROW_NUMBER() OVER (PARTITION BY c."groupId" ORDER BY c.name, c.id) AS rn
  FROM public.categories c
  WHERE c.number IS NULL
)
UPDATE public.categories c
SET number = numbered.rn
FROM numbered
WHERE c.id = numbered.id;

ALTER TABLE public.categories ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categories_group') THEN
    -- RESTRICT: eine Hauptkategorie laesst sich nur loeschen, wenn sie leer ist.
    ALTER TABLE public.categories
      ADD CONSTRAINT fk_categories_group
      FOREIGN KEY ("groupId") REFERENCES public.category_groups(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_categories_group_number') THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT uq_categories_group_number UNIQUE ("groupId", number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_group ON public.categories("groupId");
