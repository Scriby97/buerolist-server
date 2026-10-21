// Fortlaufende Nummern (Kunden pro Organisation, Projekte pro Kunde): naechste
// Nummer = hoechste bisherige + 1. Zwei gleichzeitige Anlagen koennen dieselbe
// Nummer berechnen - die UNIQUE-Constraint (migrations/005) lehnt dann eine ab
// und wir versuchen es mit neu berechneter Nummer nochmals.

const MAX_ATTEMPTS = 5;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}

export async function saveWithNextNumber<T>(
  currentMax: () => Promise<number | null | undefined>,
  save: (number: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const number = ((await currentMax()) ?? 0) + 1;
    try {
      return await save(number);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS) throw err;
    }
  }
}
