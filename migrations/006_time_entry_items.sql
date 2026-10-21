-- Material und Spesen pro Zeiteintrag (z.B. "1x Patrone Kitt, CHF 10.40").
-- Beliebig viele Positionen pro Eintrag; Betrag = Menge x Stueckpreis.
-- Preise in Rappen (ganzzahlig, keine Rundungsfehler).
--
-- WICHTIG: VOR dem Deploy des Backends ausfuehren, das diese Tabelle liest.

CREATE TABLE IF NOT EXISTS public.time_entry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "timeEntryId" UUID NOT NULL,
  -- 'material' | 'expense' (Spesen)
  type VARCHAR(20) NOT NULL,
  -- Reihenfolge wie erfasst
  position INTEGER NOT NULL DEFAULT 0,
  quantity NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  "unitPriceRappen" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_time_entry_items_time_entry
    FOREIGN KEY ("timeEntryId") REFERENCES public.time_entries(id) ON DELETE CASCADE,
  CONSTRAINT chk_time_entry_items_type CHECK (type IN ('material', 'expense')),
  CONSTRAINT chk_time_entry_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_time_entry_items_price CHECK ("unitPriceRappen" >= 0)
);

CREATE INDEX IF NOT EXISTS idx_time_entry_items_time_entry
  ON public.time_entry_items("timeEntryId");

-- Wie alle Tabellen: Zugriff nur ueber das Backend (Service-Role), RLS an.
ALTER TABLE public.time_entry_items ENABLE ROW LEVEL SECURITY;
