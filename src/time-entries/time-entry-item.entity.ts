import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TimeEntryEntity } from './time-entry.entity';

export type TimeEntryItemType = 'material' | 'expense';

/**
 * Material- oder Spesen-Position eines Zeiteintrags (migrations/006), z.B.
 * "1x Patrone Kitt, CHF 10.40". Betrag = Menge x Stueckpreis.
 */
@Entity({ name: 'time_entry_items' })
@Index('idx_time_entry_items_time_entry', ['timeEntryId'])
export class TimeEntryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  timeEntryId: string;

  @ManyToOne(() => TimeEntryEntity, (entry) => entry.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timeEntryId' })
  timeEntry: TimeEntryEntity;

  @Column({ type: 'varchar', length: 20 })
  type: TimeEntryItemType;

  @Column({ type: 'integer', default: 0 })
  position: number;

  // NUMERIC kommt aus Postgres als String - beim Lesen in Zahl umwandeln.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  quantity: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'integer' })
  unitPriceRappen: number;

  @CreateDateColumn()
  createdAt: Date;
}
