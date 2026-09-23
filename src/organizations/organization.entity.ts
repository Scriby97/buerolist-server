import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { OrganizationMemberEntity } from './organization-member.entity';
import { ProjectEntity } from '../projects/project.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';

@Entity('organizations')
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true, unique: true })
  subdomain?: string; // z.B. "firma1" für firma1.fleettrack.com

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  contactEmail?: string;

  // Oeffentliche URL des Logos im Supabase Storage Bucket "organization-logos".
  // NULL = kein Logo, das Frontend zeigt dann einen Initialen-Avatar.
  @Column({ type: 'text', nullable: true })
  logoUrl?: string | null;

  // Gesetzt, wenn der Owner die Organisation selbst zur Loeschung freigegeben
  // hat (Soft-Delete, NULL = aktiv) - siehe OrganizationsService.deleteByOwner.
  // isActive bleibt dabei bewusst true, damit die Organisation fuer globale
  // Administratoren weiterhin sichtbar bleibt (siehe OrganizationsService.hardDelete).
  @Column({ type: 'timestamp', nullable: true })
  deletionRequestedAt?: Date | null;

  @OneToMany(() => OrganizationMemberEntity, (member) => member.organization)
  members!: OrganizationMemberEntity[];

  @OneToMany(() => ProjectEntity, (project) => project.organization)
  projects!: ProjectEntity[];

  @OneToOne(
    () => OrganizationSubscriptionEntity,
    (subscription) => subscription.organization,
  )
  subscription?: OrganizationSubscriptionEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
