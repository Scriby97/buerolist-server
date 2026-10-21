import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThan, MoreThan, Not } from 'typeorm';
import { TimeEntriesService } from './time-entries.service';
import { TimeEntryEntity } from './time-entry.entity';
import { TimeEntryItemEntity } from './time-entry-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import {
  AppBadRequestException,
  AppNotFoundException,
} from '../common/exceptions';

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;

  const repo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve(d)),
    findOne: jest.fn(),
  };
  const projectRepo = { findOne: jest.fn() };
  const projectCategoryRepo = { findOne: jest.fn() };
  const itemRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((items: object[]) =>
      Promise.resolve(items.map((it, i) => ({ id: `item-${i}`, ...it }))),
    ),
    delete: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeEntriesService,
        { provide: getRepositoryToken(TimeEntryEntity), useValue: repo },
        { provide: getRepositoryToken(ProjectEntity), useValue: projectRepo },
        {
          provide: getRepositoryToken(ProjectCategoryEntity),
          useValue: projectCategoryRepo,
        },
        {
          provide: getRepositoryToken(TimeEntryItemEntity),
          useValue: itemRepo,
        },
      ],
    }).compile();

    service = module.get<TimeEntriesService>(TimeEntriesService);
  });

  describe('create', () => {
    const baseData = {
      projectId: 'project-1',
      creatorId: 'user-1',
      startAt: new Date('2026-01-01T08:00:00Z'),
      endAt: new Date('2026-01-01T10:00:00Z'),
    };

    it('throws AppNotFoundException when the project does not exist', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.create(baseData)).rejects.toThrow(
        AppNotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects an entry whose endAt is not after startAt', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });

      await expect(
        service.create({
          ...baseData,
          endAt: new Date('2026-01-01T07:00:00Z'),
        }),
      ).rejects.toThrow(AppBadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a category that is not selected for the project', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      projectCategoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ ...baseData, categoryId: 'category-x' }),
      ).rejects.toThrow(AppBadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts a category that is selected for the project', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      projectCategoryRepo.findOne.mockResolvedValue({
        projectId: 'project-1',
        categoryId: 'category-1',
      });

      await service.create({ ...baseData, categoryId: 'category-1' });

      expect(repo.save).toHaveBeenCalled();
    });

    it('creates a valid entry without a category', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });

      await service.create(baseData);

      expect(repo.save).toHaveBeenCalled();
      expect(projectCategoryRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('overlap', () => {
    const expectOverlapError = async (promise: Promise<unknown>) => {
      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppBadRequestException);
      expect((err as AppBadRequestException).getResponse()).toMatchObject({
        code: 'TIME_ENTRY_OVERLAP',
      });
    };

    const baseData = {
      projectId: 'project-1',
      creatorId: 'user-1',
      startAt: new Date('2026-01-01T07:00:00Z'),
      endAt: new Date('2026-01-01T09:00:00Z'),
    };

    it('rejects a new entry that overlaps an existing one of the same user', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      repo.findOne.mockResolvedValueOnce({ id: 'existing' });

      await expectOverlapError(service.create(baseData));
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('queries overlap per user with exclusive bounds (adjacent entries allowed)', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      repo.findOne.mockResolvedValueOnce(null);

      await service.create(baseData);

      const { where } = repo.findOne.mock.calls[0][0];
      expect(where.creatorId).toBe('user-1');
      expect(where.startAt).toEqual(LessThan(baseData.endAt));
      expect(where.endAt).toEqual(MoreThan(baseData.startAt));
      expect(where.id).toBeUndefined();
      expect(repo.save).toHaveBeenCalled();
    });

    it('ignores the entry itself when updating', async () => {
      repo.findOne
        .mockResolvedValueOnce({
          id: 'entry-1',
          projectId: 'project-1',
          creatorId: 'user-1',
          categoryId: null,
          startAt: baseData.startAt,
          endAt: baseData.endAt,
        })
        .mockResolvedValueOnce(null);

      await service.update('entry-1', {
        endAt: new Date('2026-01-01T09:30:00Z'),
      });

      const { where } = repo.findOne.mock.calls[1][0];
      expect(where.id).toEqual(Not('entry-1'));
      expect(repo.save).toHaveBeenCalled();
    });

    it('maps a DB exclusion violation (concurrent requests) to TIME_ENTRY_OVERLAP', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      repo.findOne.mockResolvedValueOnce(null);
      repo.save.mockRejectedValueOnce({ driverError: { code: '23P01' } });

      await expectOverlapError(service.create(baseData));
    });
  });

  describe('comment', () => {
    it('saves a trimmed comment and stores empty comments as null', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      repo.findOne.mockResolvedValue(null);
      const base = {
        projectId: 'project-1',
        creatorId: 'user-1',
        startAt: new Date('2026-02-01T08:00:00Z'),
        endAt: new Date('2026-02-01T10:00:00Z'),
      };

      await service.create({ ...base, comment: '  Material abgeholt  ' });
      expect(repo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ comment: 'Material abgeholt' }),
      );

      await service.create({ ...base, comment: '   ' });
      expect(repo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ comment: null }),
      );
    });

    it('keeps the comment on update when it is not sent, clears it with an empty string', async () => {
      const existing = () => ({
        id: 'entry-1',
        projectId: 'project-1',
        creatorId: 'user-1',
        categoryId: null,
        comment: 'alt',
        startAt: new Date('2026-02-02T08:00:00Z'),
        endAt: new Date('2026-02-02T10:00:00Z'),
      });

      repo.findOne
        .mockResolvedValueOnce(existing())
        .mockResolvedValueOnce(null);
      await service.update('entry-1', {
        endAt: new Date('2026-02-02T11:00:00Z'),
      });
      expect(repo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ comment: 'alt' }),
      );

      repo.findOne
        .mockResolvedValueOnce(existing())
        .mockResolvedValueOnce(null);
      await service.update('entry-1', { comment: '' });
      expect(repo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ comment: null }),
      );
    });
  });

  describe('Material und Spesen', () => {
    const base = {
      projectId: 'project-1',
      creatorId: 'user-1',
      startAt: new Date('2026-03-02T08:00:00Z'),
      endAt: new Date('2026-03-02T10:00:00Z'),
    };
    const kitt = {
      type: 'material' as const,
      quantity: 1,
      description: '  Patrone Kitt ',
      unitPriceRappen: 1040,
    };
    const parking = {
      type: 'expense' as const,
      quantity: 1,
      description: 'Parkgebühr',
      unitPriceRappen: 500,
    };

    it('speichert die Positionen beim Erfassen in der angegebenen Reihenfolge', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'project-1' });
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementationOnce((d) =>
        Promise.resolve({ id: 'e1', ...d }),
      );

      const created = await service.create({ ...base, items: [kitt, parking] });

      expect(itemRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          timeEntryId: 'e1',
          position: 0,
          description: 'Patrone Kitt',
          unitPriceRappen: 1040,
        }),
        expect.objectContaining({ position: 1, type: 'expense' }),
      ]);
      expect(created.items).toHaveLength(2);
    });

    it('ersetzt beim Bearbeiten alle Positionen, wenn eine Liste mitkommt', async () => {
      repo.findOne
        .mockResolvedValueOnce({
          id: 'e1',
          projectId: 'project-1',
          creatorId: 'user-1',
          categoryId: null,
          startAt: base.startAt,
          endAt: base.endAt,
        })
        .mockResolvedValueOnce(null);

      const updated = await service.update('e1', { items: [parking] });

      expect(itemRepo.delete).toHaveBeenCalledWith({ timeEntryId: 'e1' });
      expect(itemRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ type: 'expense', position: 0 }),
      ]);
      expect(updated.items.map((i) => i.description)).toEqual(['Parkgebühr']);
    });

    it('laesst die Positionen unveraendert, wenn keine Liste mitkommt', async () => {
      repo.findOne
        .mockResolvedValueOnce({
          id: 'e1',
          projectId: 'project-1',
          creatorId: 'user-1',
          categoryId: null,
          startAt: base.startAt,
          endAt: base.endAt,
        })
        .mockResolvedValueOnce(null);
      itemRepo.find.mockResolvedValueOnce([
        { id: 'i1', timeEntryId: 'e1', ...kitt, quantity: '2.50' },
      ]);

      const updated = await service.update('e1', { comment: 'x' });

      expect(itemRepo.delete).not.toHaveBeenCalled();
      // NUMERIC kommt als String - wird als Zahl ausgeliefert.
      expect(updated.items[0]).toMatchObject({
        quantity: 2.5,
        unitPriceRappen: 1040,
      });
    });
  });

  describe('update', () => {
    it('throws AppNotFoundException when the entry does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { startAt: new Date() }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('re-validates endAt/startAt against the existing entry when only one side changes', async () => {
      repo.findOne.mockResolvedValue({
        id: 'entry-1',
        projectId: 'project-1',
        categoryId: null,
        startAt: new Date('2026-01-01T08:00:00Z'),
        endAt: new Date('2026-01-01T10:00:00Z'),
      });

      // Neue Startzeit läge nach der (unveränderten) Endzeit -> ungültig.
      await expect(
        service.update('entry-1', {
          startAt: new Date('2026-01-01T11:00:00Z'),
        }),
      ).rejects.toThrow(AppBadRequestException);
    });
  });
});
