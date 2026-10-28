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
  let timeEntries: { find: jest.Mock };
  let profiles: { findOne: jest.Mock };
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
    timeEntries = { find: jest.fn().mockResolvedValue([]) };
    // Standard-Arbeitstag 07:15-12:00, 13:00-17:00 = 8:45
    profiles = {
      findOne: jest.fn().mockResolvedValue({
        workMorningStart: '07:15',
        workMorningEnd: '12:00',
        workAfternoonStart: '13:00',
        workAfternoonEnd: '17:00',
      }),
    };
    service = new ReminderSchedulerService(
      notifications as unknown as NotificationsService,
      timeEntries as never,
      profiles as never,
    );
  });

  it('sendet eine Erinnerung, wenn heute noch nichts erfasst wurde', async () => {
    await service.processReminder(reminder);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(notifications.markSent).toHaveBeenCalledWith('r1');
  });

  const entry = (from: string, to: string) => ({
    startAt: new Date(`2026-10-23T${from}:00Z`),
    endAt: new Date(`2026-10-23T${to}:00Z`),
  });

  it('sendet nichts, wenn heute schon ein ganzer Arbeitstag erfasst ist', async () => {
    // 4:45 + 4:00 = 8:45 = normaler Arbeitstag
    timeEntries.find.mockResolvedValue([
      entry('05:15', '10:00'),
      entry('11:00', '15:00'),
    ]);
    await service.processReminder(reminder);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('r1');
  });

  it('erinnert, wenn heute weniger als ein Arbeitstag erfasst ist', async () => {
    timeEntries.find.mockResolvedValue([entry('06:00', '09:30')]);
    await service.processReminder(reminder);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      (webpush.sendNotification as jest.Mock).mock.calls[0][1] as string,
    ) as { body: string };
    expect(payload.body).toContain('3:30 von 8:45');
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

describe('NotificationsService', () => {
  const repo = () => ({
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: object) => v),
    save: jest.fn((v: object) => Promise.resolve(v)),
  });

  it('liefert ohne gespeicherte Einstellung den Default: aus, 17:30', async () => {
    const service = new NotificationsService(repo() as never, repo() as never);
    const reminder = await service.getReminder('u1');
    expect(reminder).toMatchObject({ enabled: false, reminderTime: '17:30' });
  });

  it('schaltet beim Registrieren eines Geraets nichts automatisch ein', async () => {
    const reminders = repo();
    const service = new NotificationsService(
      reminders as never,
      repo() as never,
    );
    await service.addSubscription('u1', {
      endpoint: 'https://push/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(reminders.save).not.toHaveBeenCalled();
  });
});
