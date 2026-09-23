import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProjectEntity } from '../projects/project.entity';
import { CategoryEntity } from '../categories/category.entity';

// Legt fest, welche der Firmen-Kategorien fuer ein bestimmtes Projekt gelten
// (der Admin waehlt bei der Projekt-Erstellung eine Teilmenge der Bibliothek).
@Entity({ name: 'project_categories' })
@Unique('uq_project_category', ['projectId', 'categoryId'])
export class ProjectCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => ProjectEntity, (project) => project.projectCategories, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: ProjectEntity;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => CategoryEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;
}
