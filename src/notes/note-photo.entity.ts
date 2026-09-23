import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { NoteEntity } from './note.entity';

@Entity({ name: 'note_photos' })
export class NotePhotoEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  noteId: string;

  @ManyToOne(() => NoteEntity, (note) => note.photos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'noteId' })
  note: NoteEntity;

  // Oeffentliche URL im Supabase Storage Bucket "note-photos".
  @Column({ type: 'text' })
  url: string;

  @CreateDateColumn()
  createdAt: Date;
}
