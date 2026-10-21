import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ProjectEntity } from '../projects/project.entity';
import { CategoryEntity } from '../categories/category.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { TimeEntryItemEntity } from './time-entry-item.entity';

@Entity({ name: 'time_entries' })
@Index('idx_time_entries_project_start', ['projectId', 'startAt'])
export class TimeEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => ProjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: ProjectEntity;

  // Muss eine der fuer das Projekt gewaehlten Kategorien sein (siehe
  // ProjectCategoryEntity) - Pruefung im Service, nicht per FK erzwingbar.
  @Column({ type: 'uuid', nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity | null;

  @Column({ type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => UserProfileEntity, { nullable: false })
  @JoinColumn({ name: 'creatorId' })
  creator: UserProfileEntity;

  @Column({ type: 'timestamp' })
  startAt: Date;

  @Column({ type: 'timestamp' })
  endAt: Date;

  // Freitext-Bemerkung zum Eintrag (z.B. "Material abgeholt"), optional.
  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  // Material/Spesen (migrations/006) - werden separat geladen/ersetzt.
  @OneToMany(() => TimeEntryItemEntity, (item) => item.timeEntry)
  items?: TimeEntryItemEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
