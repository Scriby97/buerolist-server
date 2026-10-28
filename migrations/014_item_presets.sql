-- Migration: Vordefinierte Material- und Spesen-Positionen pro Organisation
--
-- Admins/Owner pflegen einen Katalog (z.B. Spesen "Mittagessen" CHF 22.00),
-- aus dem beim Erfassen gewaehlt werden kann - freie Eingabe bleibt moeglich.
-- Nummerierung pro Organisation und Typ, angezeigt mit Praefix:
--   Material  M-001, M-002, ...
--   Spesen    S-001, S-002, ...
-- Der Preis ist optional (NULL = ohne Preis).
--
-- Default: jede Organisation erhaelt die Spesen-Position S-001 "Mittagessen"
-- CHF 22.00 - bestehende hier, neue per Trigger beim Anlegen.
-- Wiederholbar.

CREATE TABLE IF NOT EXISTS public.item_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  type VARCHAR(20) NOT NULL,
  number INTEGER NOT NULL,
  description VARCHAR(200) NOT NULL,
  "unitPriceRappen" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_item_presets_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT chk_item_presets_type CHECK (type IN ('material', 'expense')),
  CONSTRAINT chk_item_presets_price CHECK ("unitPriceRappen" IS NULL OR "unitPriceRappen" >= 0),
  CONSTRAINT uq_item_presets_org_type_number UNIQUE ("organizationId", type, number)
);

CREATE INDEX IF NOT EXISTS idx_item_presets_org ON public.item_presets("organizationId");

ALTER TABLE public.item_presets ENABLE ROW LEVEL SECURITY;

-- Default fuer bestehende Organisationen (nur, wenn sie noch keine Spesen-Vorlage haben)
INSERT INTO public.item_presets ("organizationId", type, number, description, "unitPriceRappen")
SELECT o.id, 'expense', 1, 'Mittagessen', 2200
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.item_presets p WHERE p."organizationId" = o.id AND p.type = 'expense'
);

-- Default fuer neue Organisationen
CREATE OR REPLACE FUNCTION public.seed_item_presets() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.item_presets ("organizationId", type, number, description, "unitPriceRappen")
  VALUES (NEW.id, 'expense', 1, 'Mittagessen', 2200)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_item_presets ON public.organizations;
CREATE TRIGGER trg_seed_item_presets
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_item_presets();
