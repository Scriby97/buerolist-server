import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CustomerEntity } from '../customers/customer.entity';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import { ProjectStatus } from './project-status.enum';

@Entity({ name: 'projects' })
@Index('idx_projects_organization', ['organizationId'])
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => CustomerEntity, (customer) => customer.projects, {
    nullable: false,
  })
  @JoinColumn({ name: 'customerId' })
  customer: CustomerEntity;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar', default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  // Gesetzt, wenn die Organisation wegen Nichtzahlung auf den Free-Tarif
  // zurueckgefallen ist und dieses Projekt ueber dem Free-Limit lag (siehe
  // OrganizationSubscriptionsService.downgradeToFree) - Projekt bleibt
  // bestehen, wird aber wie geloescht behandelt bis die Organisation wieder
  // zahlt oder das Limit unterschreitet.
  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @OneToMany(() => ProjectCategoryEntity, (pc) => pc.project)
  projectCategories: ProjectCategoryEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
