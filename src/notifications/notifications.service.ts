import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_REMINDER_TIME,
  EntryReminderEntity,
} from './entry-reminder.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(EntryReminderEntity)
    private readonly reminderRepository: Repository<EntryReminderEntity>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: Repository<PushSubscriptionEntity>,
  ) {}

  /**
   * Erinnerungs-Einstellungen des Users. Existiert noch keine, kommt der
   * (nicht gespeicherte) Default zurueck: aktiv, 17:30 - ohne id, daran
   * erkennt das Frontend, dass der User noch nie gefragt wurde.
   */
  async getReminder(userId: string): Promise<EntryReminderEntity> {
    const existing = await this.reminderRepository.findOne({
      where: { userId },
    });
    if (existing) return existing;

    return this.reminderRepository.create({
      userId,
      enabled: true,
      reminderTime: DEFAULT_REMINDER_TIME,
      timezone: 'Europe/Zurich',
    });
  }

  async updateReminder(
    userId: string,
    enabled: boolean,
    time: string,
  ): Promise<EntryReminderEntity> {
    let reminder = await this.reminderRepository.findOne({
      where: { userId },
    });
    if (!reminder) {
      reminder = this.reminderRepository.create({ userId });
    }
    reminder.enabled = enabled;
    reminder.reminderTime = time;
    return this.reminderRepository.save(reminder);
  }

  /**
   * Registriert die Push-Subscription eines Geraets. Hat der User noch keine
   * Erinnerungs-Einstellung, wird sie dabei mit dem Default (aktiv, 17:30)
   * angelegt - die Erinnerung ist also standardmaessig an, sobald der Browser
   * Benachrichtigungen erlaubt.
   */
  async addSubscription(
    userId: string,
    dto: CreatePushSubscriptionDto,
  ): Promise<PushSubscriptionEntity> {
    const existing = await this.subscriptionRepository.findOne({
      where: { endpoint: dto.endpoint },
    });
    let saved: PushSubscriptionEntity;
    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      saved = await this.subscriptionRepository.save(existing);
    } else {
      saved = await this.subscriptionRepository.save(
        this.subscriptionRepository.create({
          userId,
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
        }),
      );
    }

    const reminder = await this.reminderRepository.findOne({
      where: { userId },
    });
    if (!reminder) {
      await this.reminderRepository.save(
        this.reminderRepository.create({
          userId,
          enabled: true,
          reminderTime: DEFAULT_REMINDER_TIME,
        }),
      );
    }
    return saved;
  }

  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionRepository.delete({ userId, endpoint });
  }

  async removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await this.subscriptionRepository.delete({ endpoint });
  }

  /**
   * Faellige Erinnerungen: reminderTime ("HH:mm") ist erreicht oder schon
   * vorbei - "<=" statt "=", damit ein auf Render Free Tier verschlafener
   * Cron-Tick beim Aufwachen nachgeholt wird. Doppelversand am selben Tag
   * verhindert lastSentAt (siehe ReminderSchedulerService).
   */
  async findDueReminders(nowHhMm: string): Promise<EntryReminderEntity[]> {
    return this.reminderRepository
      .createQueryBuilder('reminder')
      .where('reminder.enabled = true')
      .andWhere('reminder."reminderTime" <= :nowHhMm', { nowHhMm })
      .getMany();
  }

  async markSent(reminderId: string): Promise<void> {
    await this.reminderRepository.update(reminderId, {
      lastSentAt: new Date(),
    });
  }

  async getSubscriptionsForUser(
    userId: string,
  ): Promise<PushSubscriptionEntity[]> {
    return this.subscriptionRepository.find({ where: { userId } });
  }
}
