import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import {
  SubscriptionTier,
  SubscriptionStatus,
} from './enums/subscription-tier.enum';

@Entity('organization_subscriptions')
export class OrganizationSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  organizationId!: string;

  @OneToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationId' })
  organization!: OrganizationEntity;

  @Column({ type: 'varchar', default: SubscriptionTier.FREE })
  tier!: SubscriptionTier;

  @Column({ type: 'varchar', default: SubscriptionStatus.ACTIVE })
  status!: SubscriptionStatus;

  @Column({ type: 'timestamp', nullable: true })
  currentPeriodStart?: Date;

  @Column({ type: 'timestamp', nullable: true })
  currentPeriodEnd?: Date;

  @Column({ type: 'timestamp', nullable: true })
  canceledAt?: Date;

  @Column({ nullable: true })
  stripeCustomerId?: string;

  @Column({ nullable: true, unique: true })
  stripeSubscriptionId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
