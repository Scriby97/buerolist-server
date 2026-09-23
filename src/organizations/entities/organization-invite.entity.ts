import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from '../organization.entity';
import { OrganizationRole } from '../../auth/enums/user-role.enum';

@Entity('organization_invites')
export class OrganizationInviteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string; // Unique invite token

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column()
  email: string; // Email des eingeladenen Users

  @Column({ type: 'varchar', default: 'user' })
  role: OrganizationRole; // Rolle die der User bekommen soll

  @Column({ type: 'uuid', nullable: true })
  invitedBy?: string; // User ID der den Invite erstellt hat

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  usedBy?: string; // User ID der den Invite verwendet hat

  @CreateDateColumn()
  createdAt: Date;
}
