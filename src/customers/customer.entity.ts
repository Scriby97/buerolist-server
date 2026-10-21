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
  Unique,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ProjectEntity } from '../projects/project.entity';

@Entity({ name: 'customers' })
@Index('idx_customers_organization', ['organizationId'])
@Unique('uq_customers_organization_number', ['organizationId', 'number'])
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  // Fortlaufende Kundennummer pro Organisation (angezeigt als "001").
  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  contactEmail?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPhone?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @OneToMany(() => ProjectEntity, (project) => project.customer)
  projects: ProjectEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
