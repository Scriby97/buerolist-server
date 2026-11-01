import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Grund einer Abwesenheit (z.B. Krankheit, Militaer/Zivilschutz), pro
 * Organisation in den Einstellungen gepflegt - siehe migrations/015 und 016.
 */
@Entity('absence_reasons')
@Unique('uq_absence_reasons_org_number', ['organizationId', 'number'])
export class AbsenceReasonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Fortlaufend pro Organisation (Anzeige A-001, A-002, ...)
  @Column({ type: 'int' })
  number: number;

  @CreateDateColumn()
  createdAt: Date;
}
