import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service';
import { ProjectEntity } from './project.entity';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import { CategoryEntity } from '../categories/category.entity';
import { TimeEntryEntity } from '../time-entries/time-entry.entity';
import { NoteEntity } from '../notes/note.entity';
import {
  AppBadRequestException,
  AppNotFoundException,
} from '../common/exceptions';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const repo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve({ id: 'project-1', ...d })),
    findOne: jest.fn(),
  };
  const projectCategoryRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve(d)),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const categoryRepo = { find: jest.fn() };
  const timeEntryRepo = { count: jest.fn(), createQueryBuilder: jest.fn() };
  const noteRepo = { find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(ProjectEntity), useValue: repo },
        {
          provide: getRepositoryToken(ProjectCategoryEntity),
          useValue: projectCategoryRepo,
        },
        { provide: getRepositoryToken(CategoryEntity), useValue: categoryRepo },
        {
          provide: getRepositoryToken(TimeEntryEntity),
          useValue: timeEntryRepo,
        },
        { provide: getRepositoryToken(NoteEntity), useValue: noteRepo },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('create', () => {
    const baseData = {
      title: 'Holzwerk renovieren',
      customerId: 'customer-1',
      organizationId: 'org-1',
    };

    it('creates a project without categories', async () => {
      await service.create(baseData);

      expect(repo.save).toHaveBeenCalled();
      expect(projectCategoryRepo.save).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException when a category id does not exist', async () => {
      categoryRepo.find.mockResolvedValue([]);

      await expect(
        service.create({ ...baseData, categoryIds: ['category-1'] }),
      ).rejects.toThrow(AppNotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a category that belongs to a different organization', async () => {
      categoryRepo.find.mockResolvedValue([
        { id: 'category-1', organizationId: 'other-org' },
      ]);

      await expect(
        service.create({ ...baseData, categoryIds: ['category-1'] }),
      ).rejects.toThrow(AppBadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('links valid categories from the same organization', async () => {
      categoryRepo.find.mockResolvedValue([
        { id: 'category-1', organizationId: 'org-1' },
        { id: 'category-2', organizationId: 'org-1' },
      ]);

      await service.create({
        ...baseData,
        categoryIds: ['category-1', 'category-2'],
      });

      expect(projectCategoryRepo.save).toHaveBeenCalledWith([
        { projectId: 'project-1', categoryId: 'category-1' },
        { projectId: 'project-1', categoryId: 'category-2' },
      ]);
    });
  });

  describe('delete', () => {
    it('throws AppNotFoundException when the project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing-id')).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('refuses to delete a project that already has time entries', async () => {
      repo.findOne.mockResolvedValue({ id: 'project-1' });
      timeEntryRepo.count.mockResolvedValue(3);

      await expect(service.delete('project-1')).rejects.toThrow(
        AppBadRequestException,
      );
    });
  });
});
