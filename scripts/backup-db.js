/**
 * Manuelles DB-Backup: exportiert jede Tabelle des public-Schemas als eigene
 * CSV-Datei in einen neuen, zeitgestempelten Unterordner von backups/.
 * Die Tabellen werden aus der Datenbank gelesen (nicht fest eingetragen) -
 * neue Tabellen aus spaeteren Migrationen sind so automatisch dabei.
 *
 * Aufruf:
 *   npm run backup
 *   node scripts/backup-db.js
 *   node scripts/backup-db.js --out ../meine-backups
 *
 * Verbindung (wie FleetTracks scripts/backup-db.js): DATABASE_URL aus der
 * Umgebung oder aus der .env-Datei im aktuellen Verzeichnis.
 *
 * Nicht enthalten: Dateien im Supabase Storage (Notiz-Fotos, Organisations-
 * Logos) - in den CSVs stehen nur deren URLs.
 *
 * WICHTIG: Die erzeugten CSVs enthalten echte Kundendaten (Namen, Emails,
 * Zeiteintraege, Abwesenheiten) - backups/ ist deshalb in .gitignore
 * eingetragen. Niemals mit --out an einen Ort exportieren, der versioniert
 * oder oeffentlich zugaenglich ist.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('DATABASE_URL is not set and .env file was not found.');
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    if (!line.startsWith('DATABASE_URL=')) continue;
    return line.slice('DATABASE_URL='.length).trim();
  }

  throw new Error('DATABASE_URL is not set and was not found in .env.');
}

// Eine CSV-Zelle: in Anfuehrungszeichen, falls sie Trennzeichen/
// Anfuehrungszeichen/Zeilenumbrueche enthaelt; enthaltene Anfuehrungszeichen
// werden verdoppelt. null/undefined -> leere Zelle, Date -> ISO-String,
// Objekte (z.B. jsonb-Spalten) -> JSON-Text.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let str;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows, columns) {
  const header = columns.map(csvCell).join(',');
  const lines = rows.map((row) => columns.map((col) => csvCell(row[col])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

async function main() {
  const outArgIndex = process.argv.indexOf('--out');
  const outDir =
    outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? path.resolve(process.argv[outArgIndex + 1])
      : path.join(process.cwd(), 'backups');

  // Erst verbinden, dann den Ordner anlegen - sonst bleibt bei fehlender
  // bzw. falscher DATABASE_URL ein leerer Backup-Ordner zurueck.
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(outDir, timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`Backup nach: ${backupDir}\n`);

  const failed = [];
  let totalRows = 0;
  let tables = [];

  try {
    const tableResult = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    tables = tableResult.rows.map((row) => row.table_name);

    for (const table of tables) {
      try {
        const result = await client.query(`SELECT * FROM "${table}"`);
        // Spalten aus dem Ergebnis (nicht aus der ersten Zeile), damit auch
        // leere Tabellen eine Kopfzeile bekommen.
        const columns = result.fields.map((field) => field.name);
        fs.writeFileSync(path.join(backupDir, `${table}.csv`), toCsv(result.rows, columns), 'utf8');
        totalRows += result.rows.length;
        console.log(`  ✓ ${table}: ${result.rows.length} Zeilen`);
      } catch (err) {
        failed.push(table);
        console.error(`  ✗ ${table}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log(`\n${tables.length - failed.length}/${tables.length} Tabellen gesichert, ${totalRows} Zeilen insgesamt.`);

  if (failed.length > 0) {
    console.error(`Fehlgeschlagen: ${failed.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('Erinnerung: Diese CSVs enthalten echte Kundendaten - sicher aufbewahren, nicht committen.');
  }
}

main().catch((err) => {
  console.error('Backup fehlgeschlagen:', err.message);
  process.exitCode = 1;
});
