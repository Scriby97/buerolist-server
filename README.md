# Bürolist Server

Backend (NestJS) für Bürolist - Arbeitszeiterfassung für Handwerksbetriebe:
Admins legen Kunden und Projekte an, Mitarbeiter buchen Zeit darauf, mit
Notizen und Fotos pro Kunde/Projekt. Analoger Aufbau zu
[FleetTrack](https://github.com/Scriby97/fleettrack-server) - gleicher Stack
(NestJS, TypeORM, Supabase, Stripe, Render), gleiche Auth-/Organisations-/
Einladungs-Infrastruktur, neues Domänenmodell (Kunden/Kategorien/Projekte/
Zeiteinträge/Notizen statt Fahrzeuge/Nutzungen).

## Setup

1. **Supabase-Projekt anlegen** (eigenes, neues Projekt - nicht FleetTracks):
   - Im Supabase-Dashboard ein neues Projekt erstellen.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` aus
     Project Settings → API kopieren.
   - `DATABASE_URL` aus Project Settings → Database (Connection String,
     "URI"-Format) kopieren.
2. **`.env` anlegen**: `.env.example` kopieren nach `.env` und die oben
   genannten Werte eintragen. Stripe-Variablen sind optional - ohne sie
   funktioniert die Organisation-Erstellung im kostenlosen `free`-Tarif.
3. **Migrationen anwenden**: die SQL-Dateien unter `migrations/` in
   numerischer Reihenfolge gegen die Supabase-Datenbank ausführen (z.B. über
   den SQL-Editor im Supabase-Dashboard, oder `psql "$DATABASE_URL" -f
   migrations/001_initial_schema.sql` usw.). Es gibt keinen automatischen
   Migration-Runner - `synchronize: false` in `app.module.ts` ist bewusst so
   gesetzt, siehe Kommentar dort.
4. **Installieren & starten**:
   ```bash
   npm install
   npm run start:dev
   ```
   Läuft standardmäßig auf Port 3001, API-Prefix `/api` (z.B.
   `http://localhost:3001/api/health`).

## Tests / Lint / Build

```bash
npm test
npx eslint "{src,apps,libs,test}/**/*.ts"   # ohne --fix, wie CI
npm run build
```

## Deployment

Render-Service, verbunden mit diesem Repo. Build-Command `npm install && npm
run build`, Start-Command `npm run start:prod`. Env-Variablen wie in
`.env.example` beschrieben in den Render-Umgebungsvariablen setzen
(`NODE_ENV=production` zusätzlich, aktiviert SSL für die DB-Verbindung).
