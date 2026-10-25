import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import * as webpush from 'web-push';
import {
  DEFAULT_WORKDAY_MINUTES,
  EntryReminderEntity,
} from './entry-reminder.entity';
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

/** Minuten als "H:MM" (z.B. 510 -> "8:30"). */
export function formatHm(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
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

  /** Heute (Schweizer Kalendertag) erfasste Minuten eines Users. */
  async minutesRecordedToday(userId: string, now: Date): Promise<number> {
    const start = zurichStartOfDay(now);
    // Naechster Tagesbeginn: 26h spaeter liegt sicher im Folgetag (Sommerzeit)
    const end = zurichStartOfDay(new Date(start.getTime() + 26 * 3600 * 1000));
    const entries = await this.timeEntryRepository.find({
      where: {
        creatorId: userId,
        startAt: Between(start, new Date(end.getTime() - 1)),
      },
      select: { id: true, startAt: true, endAt: true },
    });
    return entries.reduce(
      (sum, entry) =>
        sum +
        Math.round(
          (new Date(entry.endAt).getTime() -
            new Date(entry.startAt).getTime()) /
            60000,
        ),
      0,
    );
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

    // Smarte Erinnerung: nur, wenn heute weniger als ein Arbeitstag erfasst ist.
    const workdayMinutes = reminder.workdayMinutes ?? DEFAULT_WORKDAY_MINUTES;
    const recordedMinutes = await this.minutesRecordedToday(
      reminder.userId,
      now,
    );
    if (recordedMinutes >= workdayMinutes) {
      await this.notificationsService.markSent(reminder.id);
      return;
    }

    const subscriptions =
      await this.notificationsService.getSubscriptionsForUser(reminder.userId);

    const payload = JSON.stringify({
      title: 'Zeiten erfassen',
      body:
        recordedMinutes > 0
          ? `Du hast heute erst ${formatHm(recordedMinutes)} von ${formatHm(workdayMinutes)} Std. erfasst.`
          : 'Vergiss nicht, deine heutigen Einträge zu erfassen.',
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
