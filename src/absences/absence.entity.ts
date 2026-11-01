import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { AbsenceReasonEntity } from './absence-reason.entity';

/**
 * Abwesenheit einer Person an einem Kalendertag (keine Projektzeit), siehe
 * migrations/015. Die Dauer wird beim Erfassen festgelegt (ganzer Tag =
 * persoenlicher Arbeitstag, halber Tag oder freie Stunden).
 */
@Entity('absences')
export class AbsenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => UserProfileEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatorId' })
  creator: UserProfileEntity;

  // Wer erfasst hat, falls nicht die Person selbst (Admin/Owner)
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => UserProfileEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserProfileEntity | null;

  @Column({ type: 'uuid' })
  reasonId: string;

  @ManyToOne(() => AbsenceReasonEntity, { nullable: false })
  @JoinColumn({ name: 'reasonId' })
  reason: AbsenceReasonEntity;

  /** Kalendertag "YYYY-MM-DD" (Schweizer Kalender) */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int' })
  minutes: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
