import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

// Die wiederverwendbare Kategorien-Bibliothek einer Organisation (z.B.
// "Gerüstbau", "Schleifen", "Streichen") - der Admin pflegt sie einmal, ein
// Projekt waehlt daraus eine Teilmenge aus (siehe ProjectCategoryEntity).
@Entity({ name: 'categories' })
@Index('idx_categories_organization', ['organizationId'])
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column({ type: 'varchar' })
  name: string;

  @CreateDateColumn()
  createdAt: Date;
}
