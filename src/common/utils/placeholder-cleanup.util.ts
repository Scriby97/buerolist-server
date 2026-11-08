import type { EntityManager } from 'typeorm';
import { UserProfileEntity } from '../../auth/entities/user-profile.entity';
import { OrganizationMemberEntity } from '../../organizations/organization-member.entity';
import { TimeEntryEntity } from '../../time-entries/time-entry.entity';
import { AbsenceEntity } from '../../absences/absence.entity';

// Mitarbeiter ohne Login (Platzhalter) existieren nur fuer ihre Organisation.
// Gehoeren sie keiner mehr an und haengen keine Zeiten/Abwesenheiten an ihnen,
// sind sie nutzlos und werden geloescht. Mit Eintraegen bleiben sie bestehen,
// damit alte Rapporte ihren Namen behalten.

/** Ist der Platzhalter ungenutzt (keine Mitgliedschaft, keine Zeiten, keine Abwesenheiten)? */
export async function isUnusedPlaceholder(
  manager: EntityManager,
  userId: string,
): Promise<boolean> {
  const [memberships, timeEntries, absences] = await Promise.all([
    manager.count(OrganizationMemberEntity, { where: { userId } }),
    manager.count(TimeEntryEntity, { where: { creatorId: userId } }),
    manager.count(AbsenceEntity, { where: { creatorId: userId } }),
  ]);
  return memberships === 0 && timeEntries === 0 && absences === 0;
}

/** Loescht den Platzhalter, falls ungenutzt. Gibt zurueck, ob geloescht wurde. */
export async function deletePlaceholderIfUnused(
  manager: EntityManager,
  userId: string,
): Promise<boolean> {
  const profile = await manager.findOne(UserProfileEntity, {
    where: { id: userId, isPlaceholder: true },
  });
  if (!profile || !(await isUnusedPlaceholder(manager, userId))) return false;
  await manager.delete(UserProfileEntity, { id: userId });
  return true;
}
