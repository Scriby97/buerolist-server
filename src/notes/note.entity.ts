import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CustomerEntity } from '../customers/customer.entity';
import { ProjectEntity } from '../projects/project.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { NotePhotoEntity } from './note-photo.entity';

// Eine Notiz haengt an genau einem Kunden ODER einem Projekt (nie beiden,
// nie keinem) - per Service geprueft, zusaetzlich CHECK-Constraint in der
// Migration.
@Entity({ name: 'notes' })
@Index('idx_notes_customer', ['customerId'])
@Index('idx_notes_project', ['projectId'])
export class NoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  customerId?: string | null;

  @ManyToOne(() => CustomerEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer?: CustomerEntity | null;

  @Column({ type: 'uuid', nullable: true })
  projectId?: string | null;

  @ManyToOne(() => ProjectEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project?: ProjectEntity | null;

  @Column({ type: 'uuid' })
  authorId: string;

  @ManyToOne(() => UserProfileEntity, { nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: UserProfileEntity;

  @Column({ type: 'text' })
  text: string;

  @OneToMany(() => NotePhotoEntity, (photo) => photo.note)
  photos: NotePhotoEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
