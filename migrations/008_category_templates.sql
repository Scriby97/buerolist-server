-- Kategorievorlagen: frei benannte Zusammenstellungen von Kategorien
-- (z.B. "Holzwerkrenovation"), die sich einem Projekt in einem Schritt
-- zuweisen lassen, statt jede Kategorie einzeln auszuwaehlen.
--
-- WICHTIG: VOR dem Deploy des Backends ausfuehren, das diese Tabellen liest.
-- Setzt Migration 007 (Hauptkategorien) voraus. Wiederholbar.

CREATE TABLE IF NOT EXISTS public.category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_category_templates_organization
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_category_templates_organization ON public.category_templates("organizationId");

CREATE TABLE IF NOT EXISTS public.category_template_categories (
  "templateId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  PRIMARY KEY ("templateId", "categoryId"),

  CONSTRAINT fk_category_template_categories_template
    FOREIGN KEY ("templateId") REFERENCES public.category_templates(id) ON DELETE CASCADE,
  -- Wird eine Kategorie geloescht, faellt sie einfach aus den Vorlagen.
  CONSTRAINT fk_category_template_categories_category
    FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_category_template_categories_category
  ON public.category_template_categories("categoryId");

ALTER TABLE public.category_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_template_categories ENABLE ROW LEVEL SECURITY;
