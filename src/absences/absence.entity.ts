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

  // Vordefinierter Grund - oder null mit frei eingegebenem reasonText
  @Column({ type: 'uuid', nullable: true })
  reasonId: string | null;

  @ManyToOne(() => AbsenceReasonEntity, { nullable: true })
  @JoinColumn({ name: 'reasonId' })
  reason: AbsenceReasonEntity | null;

  /** Eigener Grund (migrations/016), nur ohne reasonId */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reasonText: string | null;

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
