import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeEntriesService } from './time-entries.service';
import { TimeEntryEntity } from './time-entry.entity';
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
