import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntryReminderEntity } from './entry-reminder.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { TimeEntryEntity } from '../time-entries/time-entry.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EntryReminderEntity,
      PushSubscriptionEntity,
      TimeEntryEntity,
    ]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ReminderSchedulerService],
})
export class NotificationsModule {}
