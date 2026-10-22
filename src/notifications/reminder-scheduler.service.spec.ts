import * as webpush from 'web-push';
import {
  ReminderSchedulerService,
  zurichStartOfDay,
} from './reminder-scheduler.service';
import { NotificationsService } from './notifications.service';
import { EntryReminderEntity } from './entry-reminder.entity';

// @nestjs/schedule ist reines ESM - Jest (CommonJS) kann es nicht laden
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

describe('zurichStartOfDay', () => {
  it('liefert Mitternacht Schweizer Zeit (Winter +1h, Sommer +2h)', () => {
    expect(
      zurichStartOfDay(new Date('2026-01-15T10:00:00Z')).toISOString(),
    ).toBe('2026-01-14T23:00:00.000Z');
    expect(
      zurichStartOfDay(new Date('2026-07-15T10:00:00Z')).toISOString(),
    ).toBe('2026-07-14T22:00:00.000Z');
  });
});

describe('ReminderSchedulerService.processReminder', () => {
  const reminder = {
    id: 'r1',
    userId: 'u1',
    enabled: true,
    reminderTime: '17:30',
    lastSentAt: null,
  } as EntryReminderEntity;

  let notifications: jest.Mocked<
    Pick<
      NotificationsService,
      'markSent' | 'getSubscriptionsForUser' | 'removeSubscriptionByEndpoint'
    >
  >;
  let timeEntries: { findOne: jest.Mock };
  let service: ReminderSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    notifications = {
      markSent: jest.fn().mockResolvedValue(undefined),
      getSubscriptionsForUser: jest
        .fn()
        .mockResolvedValue([
          { endpoint: 'https://push/1', p256dh: 'p', auth: 'a' },
        ]),
      removeSubscriptionByEndpoint: jest.fn().mockResolvedValue(undefined),
    };
    timeEntries = { findOne: jest.fn().mockResolvedValue(null) };
    service = new ReminderSchedulerService(
      notifications as unknown as NotificationsService,
      timeEntries as never,
    );
  });

  it('sendet eine Erinnerung, wenn heute noch nichts erfasst wurde', async () => {
    await service.processReminder(reminder);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(notifications.markSent).toHaveBeenCalledWith('r1');
  });

  it('sendet nichts, wenn heute schon ein Eintrag existiert', async () => {
    timeEntries.findOne.mockResolvedValue({ id: 'e1' });
    await service.processReminder(reminder);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('r1');
  });

  it('sendet hoechstens einmal pro Tag', async () => {
    await service.processReminder({ ...reminder, lastSentAt: new Date() });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(notifications.markSent).not.toHaveBeenCalled();
  });

  it('raeumt abgelaufene Subscriptions auf', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });
    await service.processReminder(reminder);
    expect(notifications.removeSubscriptionByEndpoint).toHaveBeenCalledWith(
      'https://push/1',
    );
  });
});

describe('NotificationsService.addSubscription', () => {
  it('legt beim ersten Geraet die Standard-Erinnerung (aktiv, 17:30) an', async () => {
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: object) => v),
      save: jest.fn((v: object) => Promise.resolve(v)),
    };
    const reminders = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: object) => v),
      save: jest.fn((v: object) => Promise.resolve(v)),
    };
    const service = new NotificationsService(
      reminders as never,
      subscriptions as never,
    );
    await service.addSubscription('u1', {
      endpoint: 'https://push/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(reminders.save).toHaveBeenCalledWith({
      userId: 'u1',
      enabled: true,
      reminderTime: '17:30',
    });
  });
});
