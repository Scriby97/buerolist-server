-- Bürolist baseline schema migration
-- Generische Auth-/Organisations-Infrastruktur, 1:1 von FleetTrack übernommen
-- (Multi-Tenancy, Rollen, Einladungen, Subscriptions) - im Gegensatz zu
-- FleetTracks Migrationshistorie hier als EIN konsolidiertes Skript statt
-- über mehrere inkrementelle Schritte, da dieses Repo frisch startet.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Organizations ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "contactEmail" VARCHAR(255),
  -- Oeffentliche URL des Logos im Supabase Storage Bucket
  -- "organization-logos". NULL = kein Logo (Frontend zeigt Initialen-Avatar).
  "logoUrl" TEXT,
  -- Gesetzt, wenn der Owner die Organisation selbst zur Loeschung freigegeben
  -- hat (Soft-Delete, NULL = aktiv) - siehe OrganizationsService.deleteByOwner.
  "deletionRequestedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. User profiles ------------------------------------------------------------
-- Gleiche ID wie der Supabase Auth User (kein eigener Primary Key).
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  -- Funktionale/System-Rolle: 'user' oder 'administrator' (globaler Admin,
  -- sieht alle Organisationen) - NICHT die Organisations-Rolle, siehe unten.
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  "firstName" VARCHAR(255),
  "lastName" VARCHAR(255),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Organization members (Zuordnungstabelle: User <-> Organisation) --------
-- Ein User kann Mitglied mehrerer Organisationen mit je eigener Rolle sein.
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  -- Organisations-Rolle: 'employee', 'admin' oder 'owner'.
  role VARCHAR(50) NOT NULL DEFAULT 'employee',
  "joinedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Gesetzt, wenn die Mitgliedschaft wegen Nichtzahlung der Organisation
  -- archiviert wurde (NULL = aktiv) - kommt bei erneuter Zahlung automatisch
  -- zurueck, siehe OrganizationSubscriptionsService.
  "archivedAt" TIMESTAMP,

  CONSTRAINT fk_org_members_user
    FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_members_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_org_membership
    UNIQUE ("userId", "organizationId")
);

COMMENT ON COLUMN public.user_profiles.role IS
  'Funktionale/System-Rolle: user (normaler User) oder administrator (globaler Admin - sieht alle Organisationen).';
COMMENT ON COLUMN public.organization_members.role IS
  'Organisations-Rolle: employee (bucht nur eigene Zeit), admin (kann die Organisation verwalten), owner (kann die Organisation löschen).';

-- 4. Organization subscriptions (1:1 mit organizations) ---------------------
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL UNIQUE,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  "currentPeriodStart" TIMESTAMP,
  "currentPeriodEnd" TIMESTAMP,
  "canceledAt" TIMESTAMP,
  "stripeCustomerId" VARCHAR(255),
  "stripeSubscriptionId" VARCHAR(255) UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_org_subscriptions_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT chk_org_subscriptions_tier
    CHECK (tier IN ('free', 'pro')),
  CONSTRAINT chk_org_subscriptions_status
    CHECK (status IN ('active', 'past_due', 'canceled'))
);

COMMENT ON COLUMN public.organization_subscriptions.tier IS
  'Stabiler Plan-Key: free oder pro (Platzhalter-Preise). Limits/Preise siehe SUBSCRIPTION_LIMITS im Code.';
COMMENT ON COLUMN public.organization_subscriptions.status IS
  'Billing-Status: active, past_due (Zahlung fehlgeschlagen) oder canceled.';

-- 5. Organization invites -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL UNIQUE,
  "organizationId" UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  "invitedBy" UUID,
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt" TIMESTAMP,
  "usedBy" UUID,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_org_invites_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Performance indexes --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members("userId");
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members("organizationId");
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org ON public.organization_subscriptions("organizationId");
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_tier ON public.organization_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.organization_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_organization ON public.organization_invites("organizationId");

-- Row Level Security ----------------------------------------------------------
-- Der Server verbindet über die direkte Postgres-Connection (Service-Rolle,
-- umgeht RLS) - diese Policies greifen nur, falls jemals ein Client direkt
-- mit dem Supabase Anon-/Authenticated-Key auf die DB zugreift (aktuell nicht
-- der Fall, das Frontend spricht ausschliesslich mit der Nest-API). Trotzdem
-- als Verteidigung in der Tiefe gesetzt, analog zu FleetTrack.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Administrators can view all organizations" ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = organizations.id AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Administrators can view all memberships" ON public.organization_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view their own memberships" ON public.organization_members
  FOR SELECT
  USING (
    "userId" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Administrators can view all subscriptions" ON public.organization_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view their organizations' subscription" ON public.organization_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = organization_subscriptions."organizationId"
      AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Administrators can view all invites" ON public.organization_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view invites for their organizations" ON public.organization_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = organization_invites."organizationId"
      AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Public can read invite by token" ON public.organization_invites
  FOR SELECT
  USING (true);
