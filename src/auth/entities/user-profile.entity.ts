import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrganizationMemberEntity } from '../../organizations/organization-member.entity';
import { UserRole } from '../enums/user-role.enum';

@Entity('user_profiles')
export class UserProfileEntity {
  @PrimaryColumn('uuid')
  id!: string; // Gleiche ID wie Supabase Auth User

  // Fehlt bei Mitarbeitern ohne Login (isPlaceholder) - siehe migrations/011.
  @Column({ type: 'varchar', unique: true, nullable: true })
  email!: string | null;

  /** Mitarbeiter ohne Login, von Admin/Owner angelegt (kein Supabase-Auth-User) */
  @Column({ default: false })
  isPlaceholder!: boolean;

  // type: 'varchar' explizit, damit sich am SQL-Spaltentyp nichts ändert -
  // nur der TS-Typ wird auf UserRole verschärft (statt string).
  @Column({ type: 'varchar', default: 'user' })
  role!: UserRole;

  @OneToMany(() => OrganizationMemberEntity, (membership) => membership.user)
  organizationMemberships!: OrganizationMemberEntity[];

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  // Normaler Arbeitstag (migrations/013) - Startzeit-Vorschlag beim Erfassen
  // und Dauer fuer die Erfassungserinnerung.
  @Column({ type: 'varchar', length: 5, default: '07:15' })
  workMorningStart!: string;

  @Column({ type: 'varchar', length: 5, default: '12:00' })
  workMorningEnd!: string;

  @Column({ type: 'varchar', length: 5, default: '13:00' })
  workAfternoonStart!: string;

  @Column({ type: 'varchar', length: 5, default: '17:00' })
  workAfternoonEnd!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
