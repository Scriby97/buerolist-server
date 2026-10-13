-- Optionale Freitext-Bemerkung pro Zeiteintrag (z.B. "Material abgeholt").
-- Rein additiv (nullable) - bestehende Einträge bleiben unverändert.
--
-- WICHTIG: VOR dem Deploy des Backends ausführen, das die Spalte "comment"
-- liest - sonst schlagen alle Abfragen auf time_entries fehl.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS comment TEXT;
