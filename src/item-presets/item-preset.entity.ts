import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type ItemPresetType = 'material' | 'expense';

/**
 * Vordefinierte Material- bzw. Spesen-Position einer Organisation (z.B.
 * Spesen S-001 "Mittagessen" CHF 22.00), siehe migrations/014. Beim Erfassen
 * waehlbar; die Position im Zeiteintrag ist eine Kopie (spaetere Aenderungen
 * am Katalog veraendern bestehende Eintraege nicht).
 */
@Entity('item_presets')
@Unique('uq_item_presets_org_type_number', ['organizationId', 'type', 'number'])
export class ItemPresetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 20 })
  type: ItemPresetType;

  // Fortlaufend pro Organisation und Typ (Anzeige M-001 / S-001)
  @Column({ type: 'int' })
  number: number;

  @Column({ type: 'varchar', length: 200 })
  description: string;

  /** Stueckpreis in Rappen, null = ohne Preis */
  @Column({ type: 'int', nullable: true })
  unitPriceRappen: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
