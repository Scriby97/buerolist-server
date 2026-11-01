-- Migration: Abwesenheitsgrund "Privater Termin" als weiterer Default
-- (setzt 017 voraus)
--
-- Default-Gruende jeder Organisation:
--   A-001 Krankheit, A-002 Unfall, A-003 Militär/Zivilschutz,
--   A-004 Feuerwehr, A-005 Ferien, A-006 Frei, A-007 Privater Termin
-- Bestehende Organisationen erhalten "Privater Termin" mit der naechsten
-- freien Nummer. Wiederholbar.

INSERT INTO public.absence_reasons ("organizationId", name, number)
SELECT o.id, 'Privater Termin', COALESCE((
  SELECT MAX(r.number) FROM public.absence_reasons r WHERE r."organizationId" = o.id
), 0) + 1
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.absence_reasons r WHERE r."organizationId" = o.id AND r.name = 'Privater Termin'
);

CREATE OR REPLACE FUNCTION public.seed_absence_reasons() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.absence_reasons ("organizationId", name, number)
  VALUES
    (NEW.id, 'Krankheit', 1),
    (NEW.id, 'Unfall', 2),
    (NEW.id, 'Militär/Zivilschutz', 3),
    (NEW.id, 'Feuerwehr', 4),
    (NEW.id, 'Ferien', 5),
    (NEW.id, 'Frei', 6),
    (NEW.id, 'Privater Termin', 7)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
