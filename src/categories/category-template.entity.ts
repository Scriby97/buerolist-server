import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CategoryEntity } from './category.entity';

/**
 * Kategorievorlage (migrations/008), z.B. "Holzwerkrenovation": eine frei
 * benannte Auswahl von Kategorien, die sich einem Projekt in einem Schritt
 * zuweisen laesst.
 */
@Entity({ name: 'category_templates' })
@Index('idx_category_templates_organization', ['organizationId'])
export class CategoryTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column({ type: 'varchar' })
  name: string;

  @ManyToMany(() => CategoryEntity)
  @JoinTable({
    name: 'category_template_categories',
    joinColumn: { name: 'templateId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: CategoryEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
