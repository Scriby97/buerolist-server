import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CategoryGroupEntity } from './category-group.entity';

// Die wiederverwendbare Kategorien-Bibliothek einer Organisation (z.B.
// "Gerüstbau", "Schleifen", "Streichen") - der Admin pflegt sie einmal, ein
// Projekt waehlt daraus eine Teilmenge aus (siehe ProjectCategoryEntity).
@Entity({ name: 'categories' })
@Index('idx_categories_organization', ['organizationId'])
@Unique('uq_categories_group_number', ['groupId', 'number'])
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  // Hauptkategorie (migrations/007) und Nummer darin - angezeigt als
  // "<Hauptkategorie-Nr>.<Nr zweistellig>", z.B. "1.03".
  @Column({ type: 'uuid' })
  groupId: string;

  @ManyToOne(() => CategoryGroupEntity, (group) => group.categories, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'groupId' })
  group?: CategoryGroupEntity;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'varchar' })
  name: string;

  @CreateDateColumn()
  createdAt: Date;
}
