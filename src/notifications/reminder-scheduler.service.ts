import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { EntryReminderEntity } from './entry-reminder.entity';
import { NotificationsService } from './notifications.service';
import { TimeEntryEntity } from '../time-entries/time-entry.entity';
import { zurichDateKey } from '../common/utils/work-week.util';

/**
 * Beginn des heutigen Tages (00:00 Europe/Zurich) als Date - Render laeuft in
 * UTC, deshalb ueber den Offset der Schweizer Zeit gerechnet.
 */
export function zurichStartOfDay(now: Date = new Date()): Date {
  const [year, month, day] = zurichDateKey(now).split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  // Offset der Schweizer Zeit an diesem Tag (+1h bzw. +2h im Sommer)
  const zurichHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      hour: '2-digit',
      hour12: false,
    }).format(new Date(utcMidnight)),
  );
  return new Date(utcMidnight - zurichHour * 60 * 60 * 1000);
}

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private vapidConfigured = false;

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(TimeEntryEntity)
    private readonly timeEntryRepository: Repository<TimeEntryEntity>,
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT nicht gesetzt - Erfassungserinnerungen sind deaktiviert.',
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueReminders(): Promise<void> {
    if (!this.vapidConfigured) return;

    const nowHhMm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    const dueReminders =
      await this.notificationsService.findDueReminders(nowHhMm);

    for (const reminder of dueReminders) {
      try {
        await this.processReminder(reminder);
      } catch (error) {
        this.logger.error(
          `Fehler beim Verarbeiten der Erinnerung fuer User ${reminder.userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async processReminder(reminder: EntryReminderEntity): Promise<void> {
    const now = new Date();

    // Pro Kalendertag (Schweizer Zeit) hoechstens einmal
    if (
      reminder.lastSentAt &&
      zurichDateKey(new Date(reminder.lastSentAt)) === zurichDateKey(now)
    ) {
      return;
    }

    // Smarte Erinnerung: wer heute schon etwas erfasst hat, bekommt keine.
    const todaysEntry = await this.timeEntryRepository.findOne({
      where: {
        creatorId: reminder.userId,
        startAt: MoreThanOrEqual(zurichStartOfDay(now)),
      },
      select: { id: true },
    });
    if (todaysEntry) {
      await this.notificationsService.markSent(reminder.id);
      return;
    }

    const subscriptions =
      await this.notificationsService.getSubscriptionsForUser(reminder.userId);

    const payload = JSON.stringify({
      title: 'Zeiten erfassen',
      body: 'Vergiss nicht, deine heutigen Einträge zu erfassen.',
      url: '/',
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription ungueltig (Berechtigung entzogen, Geraet weg) - aufraeumen
            await this.notificationsService.removeSubscriptionByEndpoint(
              subscription.endpoint,
            );
          } else {
            this.logger.error(
              `Push an ${subscription.endpoint} fehlgeschlagen`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      }),
    );

    await this.notificationsService.markSent(reminder.id);
  }
}
