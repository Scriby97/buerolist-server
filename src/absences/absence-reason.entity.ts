import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Grund einer Abwesenheit (z.B. Krankheit, Militaer/Zivilschutz), pro
 * Organisation in den Einstellungen gepflegt - siehe migrations/015.
 */
@Entity('absence_reasons')
export class AbsenceReasonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Anzeige-Reihenfolge; neue Gruende kommen ans Ende
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
