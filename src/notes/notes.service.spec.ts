import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotesService } from './notes.service';
import { NoteEntity } from './note.entity';
import { NotePhotoEntity } from './note-photo.entity';
import { CustomerEntity } from '../customers/customer.entity';
import { ProjectEntity } from '../projects/project.entity';
import { NotePhotosService } from './note-photos.service';
import {
  AppBadRequestException,
  AppNotFoundException,
} from '../common/exceptions';

describe('NotesService', () => {
  let service: NotesService;

  const noteRepo = { create: jest.fn((d) => d), save: jest.fn((d) => d) };
  const photoRepo = {};
  const customerRepo = { findOne: jest.fn() };
  const projectRepo = { findOne: jest.fn() };
  const photosService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: getRepositoryToken(NoteEntity), useValue: noteRepo },
        { provide: getRepositoryToken(NotePhotoEntity), useValue: photoRepo },
        { provide: getRepositoryToken(CustomerEntity), useValue: customerRepo },
        { provide: getRepositoryToken(ProjectEntity), useValue: projectRepo },
        { provide: NotePhotosService, useValue: photosService },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  describe('resolveTargetOrganization', () => {
    it('rejects when neither customerId nor projectId is given', async () => {
      await expect(service.resolveTargetOrganization()).rejects.toThrow(
        AppBadRequestException,
      );
    });

    it('rejects when both customerId and projectId are given', async () => {
      await expect(
        service.resolveTargetOrganization('customer-1', 'project-1'),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('resolves the organization of the customer when only customerId is given', async () => {
      customerRepo.findOne.mockResolvedValue({
        id: 'customer-1',
        organizationId: 'org-1',
      });

      const organizationId = await service.resolveTargetOrganization(
        'customer-1',
        undefined,
      );

      expect(organizationId).toBe('org-1');
      expect(projectRepo.findOne).not.toHaveBeenCalled();
    });

    it('resolves the organization of the project when only projectId is given', async () => {
      projectRepo.findOne.mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-2',
      });

      const organizationId = await service.resolveTargetOrganization(
        undefined,
        'project-1',
      );

      expect(organizationId).toBe('org-2');
      expect(customerRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException when the referenced customer does not exist', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resolveTargetOrganization('missing-customer', undefined),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('throws AppNotFoundException when the referenced project does not exist', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resolveTargetOrganization(undefined, 'missing-project'),
      ).rejects.toThrow(AppNotFoundException);
    });
  });
});
