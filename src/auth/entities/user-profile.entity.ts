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

  @Column({ unique: true })
  email!: string;

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
