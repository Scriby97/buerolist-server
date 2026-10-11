-- Verhindert doppelt verbuchte Zeit: Zeiteinträge derselben Person dürfen
-- sich nicht überschneiden (auch nicht über verschiedene Projekte hinweg).
-- Der Service prüft das bereits vorab (TimeEntriesService.assertNoOverlap,
-- liefert TIME_ENTRY_OVERLAP); diese Constraint fängt zusätzlich zwei
-- gleichzeitige Requests ab, die beide die Vorab-Prüfung bestehen würden.
--
-- tsrange ist standardmässig '[)' (Ende exklusiv) - aneinandergrenzende
-- Einträge wie 07:00-09:00 und 09:00-11:00 bleiben erlaubt.
--
-- ACHTUNG: Schlägt fehl, falls bereits überlappende Einträge existieren.
-- Diese vorher finden mit:
--   SELECT a.id, b.id, a."creatorId", a."startAt", a."endAt", b."startAt", b."endAt"
--   FROM public.time_entries a
--   JOIN public.time_entries b
--     ON a."creatorId" = b."creatorId" AND a.id < b.id
--    AND a."startAt" < b."endAt" AND b."startAt" < a."endAt";

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_no_overlap
  EXCLUDE USING gist (
    "creatorId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  );
