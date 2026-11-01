-- Migration: Abwesenheiten (Krankheit, Unfall, Militaer/Zivilschutz, Feuerwehr, ...)
--
-- Abwesenheiten sind keine Projektzeit: eigene Tabelle, pro Person und
-- Kalendertag mit Dauer in Minuten (ganzer Tag = persoenlicher Arbeitstag,
-- halber Tag oder freie Stunden - berechnet beim Erfassen).
--
-- Die Gruende pflegt jede Organisation selbst (Einstellungen). Default:
-- Krankheit, Unfall, Militaer/Zivilschutz, Feuerwehr - bestehende
-- Organisationen hier, neue per Trigger beim Anlegen.
-- Ein Grund, der noch verwendet wird, kann nicht geloescht werden.
-- Wiederholbar.

CREATE TABLE IF NOT EXISTS public.absence_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_absence_reasons_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_absence_reasons_org ON public.absence_reasons("organizationId");

ALTER TABLE public.absence_reasons ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "creatorId" UUID NOT NULL,
  "createdById" UUID,
  "reasonId" UUID NOT NULL,
  date DATE NOT NULL,
  minutes INTEGER NOT NULL,
  comment TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_absences_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_absences_creator
    FOREIGN KEY ("creatorId") REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_absences_created_by
    FOREIGN KEY ("createdById") REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  -- NO ACTION (nicht RESTRICT): beim Loeschen der ganzen Organisation
  -- verschwinden Abwesenheiten und Gruende in derselben Kaskade.
  CONSTRAINT fk_absences_reason
    FOREIGN KEY ("reasonId") REFERENCES public.absence_reasons(id),
  CONSTRAINT chk_absences_minutes CHECK (minutes > 0 AND minutes <= 1440)
);

CREATE INDEX IF NOT EXISTS idx_absences_org_date ON public.absences("organizationId", date);
CREATE INDEX IF NOT EXISTS idx_absences_creator_date ON public.absences("creatorId", date);
CREATE INDEX IF NOT EXISTS idx_absences_reason ON public.absences("reasonId");

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- Default-Gruende fuer bestehende Organisationen (nur, wenn sie noch keine haben)
INSERT INTO public.absence_reasons ("organizationId", name, "sortOrder")
SELECT o.id, d.name, d."sortOrder"
FROM public.organizations o
CROSS JOIN (VALUES
  ('Krankheit', 1),
  ('Unfall', 2),
  ('Militär/Zivilschutz', 3),
  ('Feuerwehr', 4)
) AS d(name, "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM public.absence_reasons r WHERE r."organizationId" = o.id
);

-- Default-Gruende fuer neue Organisationen
CREATE OR REPLACE FUNCTION public.seed_absence_reasons() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.absence_reasons ("organizationId", name, "sortOrder")
  VALUES
    (NEW.id, 'Krankheit', 1),
    (NEW.id, 'Unfall', 2),
    (NEW.id, 'Militär/Zivilschutz', 3),
    (NEW.id, 'Feuerwehr', 4);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_absence_reasons ON public.organizations;
CREATE TRIGGER trg_seed_absence_reasons
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_absence_reasons();
