import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CategoryEntity } from './category.entity';

/**
 * Hauptkategorie (migrations/007), z.B. "Malerarbeiten" - frei benennbar,
 * beliebig viele pro Organisation, fortlaufend nummeriert (1, 2, 3 ...).
 * Die Kategorien darin heissen "1.01", "1.02" usw.
 */
@Entity({ name: 'category_groups' })
@Index('idx_category_groups_organization', ['organizationId'])
@Unique('uq_category_groups_organization_number', ['organizationId', 'number'])
export class CategoryGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'varchar' })
  name: string;

  @OneToMany(() => CategoryEntity, (category) => category.group)
  categories?: CategoryEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
