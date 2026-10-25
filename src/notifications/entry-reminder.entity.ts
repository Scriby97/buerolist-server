import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Standard-Erinnerungszeit (Schweizer Zeit); eingeschaltet wird erst auf Zustimmung. */
export const DEFAULT_REMINDER_TIME = '17:30';

/** Standard-Arbeitstag: 8:00 Stunden. */
export const DEFAULT_WORKDAY_MINUTES = 480;

@Entity('entry_reminders')
export class EntryReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ default: false })
  enabled: boolean;

  // Format "HH:mm", ausgewertet in Europe/Zurich.
  @Column({ default: DEFAULT_REMINDER_TIME })
  reminderTime: string;

  @Column({ default: 'Europe/Zurich' })
  timezone: string;

  // Dauer eines Arbeitstags - erinnert wird nur, wenn heute weniger erfasst ist.
  @Column({ type: 'int', default: DEFAULT_WORKDAY_MINUTES })
  workdayMinutes: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
