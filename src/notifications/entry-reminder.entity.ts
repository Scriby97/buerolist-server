import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Standard-Erinnerung: aktiv, 17:30 Schweizer Zeit. */
export const DEFAULT_REMINDER_TIME = '17:30';

@Entity('entry_reminders')
export class EntryReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ default: true })
  enabled: boolean;

  // Format "HH:mm", ausgewertet in Europe/Zurich.
  @Column({ default: DEFAULT_REMINDER_TIME })
  reminderTime: string;

  @Column({ default: 'Europe/Zurich' })
  timezone: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
