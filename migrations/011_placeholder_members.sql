-- Migration: Mitarbeiter ohne Login (Platzhalter) + "erfasst von"
--
-- 1. Admins/Owner koennen Mitarbeiter ohne Login anlegen: ein user_profiles-
--    Eintrag ohne E-Mail mit isPlaceholder = true (kein Supabase-Auth-User).
-- 2. time_entries."createdById": wer den Eintrag tatsaechlich erfasst hat
--    (weicht vom creatorId ab, wenn ein Admin fuer einen Mitarbeiter erfasst).
--    NULL bei bestehenden Eintraegen = selbst erfasst.
-- 3. organization_invites."placeholderUserId": Einladung, die einen
--    Platzhalter uebergibt - beim Annehmen gehen dessen Eintraege an das
--    echte Konto ueber.
-- Wiederholbar.

ALTER TABLE public.user_profiles ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles."isPlaceholder" IS
  'Mitarbeiter ohne Login, von Admin/Owner angelegt (keine E-Mail, kein Auth-User).';

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS "createdById" UUID;

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS fk_time_entries_created_by;
ALTER TABLE public.time_entries
  ADD CONSTRAINT fk_time_entries_created_by
  FOREIGN KEY ("createdById") REFERENCES public.user_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.time_entries."createdById" IS
  'Wer den Eintrag erfasst hat (NULL = der Mitarbeiter selbst, Altdaten).';

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS "placeholderUserId" UUID;

ALTER TABLE public.organization_invites
  DROP CONSTRAINT IF EXISTS fk_org_invites_placeholder;
ALTER TABLE public.organization_invites
  ADD CONSTRAINT fk_org_invites_placeholder
  FOREIGN KEY ("placeholderUserId") REFERENCES public.user_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organization_invites."placeholderUserId" IS
  'Mitarbeiter ohne Login, der mit dieser Einladung an ein echtes Konto uebergeben wird.';
