-- Bürolist Domänenmodell: Kunden, Kategorien, Projekte, Zeiteinträge, Notizen.
-- Siehe Plan "Neues Domänenmodell" für die fachliche Begründung jeder Tabelle.

-- 1. Customers ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  "contactEmail" VARCHAR(255),
  "contactPhone" VARCHAR(255),
  address TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_customers_organization
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customers_organization ON public.customers("organizationId");

-- 2. Categories (wiederverwendbare Bibliothek pro Organisation) --------------
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_categories_organization
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_categories_organization ON public.categories("organizationId");

-- 3. Projects -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  -- Gesetzt, wenn die Organisation wegen Nichtzahlung auf den Free-Tarif
  -- zurueckgefallen ist und dieses Projekt ueber dem Free-Limit lag - siehe
  -- OrganizationSubscriptionsService.downgradeToFree/activatePaidTier.
  "archivedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_projects_organization
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Bewusst kein ON DELETE CASCADE auf customerId: ein Kunde mit bestehenden
  -- Projekten kann nicht geloescht werden (siehe CustomersService.delete) -
  -- das verhindert, dass die Projekt-History versehentlich mitverschwindet.
  CONSTRAINT fk_projects_customer
    FOREIGN KEY ("customerId") REFERENCES public.customers(id),
  CONSTRAINT chk_projects_status
    CHECK (status IN ('active', 'completed'))
);
CREATE INDEX IF NOT EXISTS idx_projects_organization ON public.projects("organizationId");
CREATE INDEX IF NOT EXISTS idx_projects_customer ON public.projects("customerId");

-- 4. Project categories (Join-Tabelle: welche Kategorien gelten pro Projekt) --
CREATE TABLE IF NOT EXISTS public.project_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,

  CONSTRAINT fk_project_categories_project
    FOREIGN KEY ("projectId") REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_categories_category
    FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT uq_project_category
    UNIQUE ("projectId", "categoryId")
);
CREATE INDEX IF NOT EXISTS idx_project_categories_project ON public.project_categories("projectId");
CREATE INDEX IF NOT EXISTS idx_project_categories_category ON public.project_categories("categoryId");

-- 5. Time entries (Von/Bis-Zeiterfassung je Projekt) --------------------------
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  -- Muss eine der fuer das Projekt gewaehlten Kategorien sein (Pruefung im
  -- Service, nicht per FK erzwingbar) - SET NULL beim Loeschen der Kategorie
  -- selbst, damit bestehende Zeiteintraege nicht mitgeloescht werden.
  "categoryId" UUID,
  "creatorId" UUID NOT NULL,
  "startAt" TIMESTAMP NOT NULL,
  "endAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_time_entries_project
    FOREIGN KEY ("projectId") REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_entries_category
    FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_time_entries_creator
    FOREIGN KEY ("creatorId") REFERENCES public.user_profiles(id),
  CONSTRAINT chk_time_entries_end_after_start
    CHECK ("endAt" > "startAt")
);
-- Zusammengesetzter Index von Anfang an (anders als bei FleetTracks usages,
-- wo der fehlende Index erst nachtraeglich als Skalierungs-Fix ergaenzt
-- wurde) - traegt sowohl die Zeit-Zusammenfassung eines Projekts als auch
-- die cursor-paginierte "Meine Einträge"-Liste (ORDER BY startAt DESC).
CREATE INDEX IF NOT EXISTS idx_time_entries_project_start ON public.time_entries("projectId", "startAt");

-- 6. Notes (pro Kunde ODER pro Projekt, nie beides/keines) --------------------
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "customerId" UUID,
  "projectId" UUID,
  "authorId" UUID NOT NULL,
  text TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notes_organization
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_customer
    FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_project
    FOREIGN KEY ("projectId") REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_author
    FOREIGN KEY ("authorId") REFERENCES public.user_profiles(id),
  -- Genau eines von customerId/projectId muss gesetzt sein - siehe
  -- NotesService.resolveTargetOrganization (dort zusaetzlich applikatorisch
  -- geprueft, hier als harte DB-Garantie).
  CONSTRAINT chk_notes_exactly_one_target
    CHECK (
      (("customerId" IS NOT NULL)::int + ("projectId" IS NOT NULL)::int) = 1
    )
);
CREATE INDEX IF NOT EXISTS idx_notes_customer ON public.notes("customerId");
CREATE INDEX IF NOT EXISTS idx_notes_project ON public.notes("projectId");

-- 7. Note photos ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.note_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "noteId" UUID NOT NULL,
  -- Oeffentliche URL im Supabase Storage Bucket "note-photos".
  url TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_note_photos_note
    FOREIGN KEY ("noteId") REFERENCES public.notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_photos_note ON public.note_photos("noteId");

-- Row Level Security ------------------------------------------------------------
-- Siehe Hinweis in 001_initial_schema.sql - greift nur bei direktem Zugriff
-- mit dem Supabase Anon-/Authenticated-Key, aktuell ungenutzt.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customers of their organizations" ON public.customers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = customers."organizationId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view categories of their organizations" ON public.categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = categories."organizationId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view projects of their organizations" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = projects."organizationId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view project categories of their organizations" ON public.project_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om."organizationId" = p."organizationId"
      WHERE p.id = project_categories."projectId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view time entries of their organizations" ON public.time_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.organization_members om ON om."organizationId" = p."organizationId"
      WHERE p.id = time_entries."projectId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view notes of their organizations" ON public.notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = notes."organizationId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view note photos of their organizations" ON public.note_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      JOIN public.organization_members om ON om."organizationId" = n."organizationId"
      WHERE n.id = note_photos."noteId" AND om."userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );
