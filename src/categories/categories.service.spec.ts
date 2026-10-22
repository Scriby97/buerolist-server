import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoryEntity } from './category.entity';
import { CategoryGroupEntity } from './category-group.entity';
import { CategoryTemplateEntity } from './category-template.entity';
import { AppBadRequestException } from '../common/exceptions';

describe('CategoriesService - Hauptkategorien', () => {
  let service: CategoriesService;

  const repo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve({ id: 'cat-1', ...d })),
    findOne: jest.fn(),
    maximum: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
  };
  const groupRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve({ id: 'group-1', ...d })),
    findOne: jest.fn(),
    maximum: jest.fn(),
    remove: jest.fn(),
  };

  const templateRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve({ id: 'tpl-1', ...d })),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(CategoryEntity), useValue: repo },
        {
          provide: getRepositoryToken(CategoryGroupEntity),
          useValue: groupRepo,
        },
        {
          provide: getRepositoryToken(CategoryTemplateEntity),
          useValue: templateRepo,
        },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('nummeriert Hauptkategorien pro Organisation fortlaufend', async () => {
    groupRepo.maximum.mockResolvedValueOnce(2);
    const group = await service.createGroup({
      name: ' Bodenbelagsarbeiten ',
      organizationId: 'org-1',
    });
    expect(group).toMatchObject({
      number: 3,
      name: 'Bodenbelagsarbeiten',
      categories: [],
    });
    expect(groupRepo.maximum).toHaveBeenCalledWith('number', {
      organizationId: 'org-1',
    });
  });

  it('nummeriert Kategorien innerhalb ihrer Hauptkategorie', async () => {
    groupRepo.findOne.mockResolvedValue({
      id: 'g1',
      organizationId: 'org-1',
      number: 1,
    });
    repo.maximum.mockResolvedValueOnce(4);
    const category = await service.create({
      name: 'Streichen',
      organizationId: 'org-1',
      groupId: 'g1',
    });
    expect(category).toMatchObject({ number: 5, groupId: 'g1' });
    expect(repo.maximum).toHaveBeenCalledWith('number', { groupId: 'g1' });
  });

  it('lehnt eine Hauptkategorie einer anderen Organisation ab', async () => {
    groupRepo.findOne.mockResolvedValue({
      id: 'g9',
      organizationId: 'other-org',
      number: 1,
    });
    await expect(
      service.create({ name: 'X', organizationId: 'org-1', groupId: 'g9' }),
    ).rejects.toThrow(AppBadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('gibt beim Verschieben die naechste Nummer der neuen Hauptkategorie', async () => {
    repo.findOne.mockResolvedValue({
      id: 'c1',
      organizationId: 'org-1',
      groupId: 'g1',
      number: 3,
      name: 'Schleifen',
    });
    groupRepo.findOne.mockResolvedValue({
      id: 'g2',
      organizationId: 'org-1',
      number: 2,
    });
    repo.maximum.mockResolvedValueOnce(null);
    const moved = await service.update('c1', { groupId: 'g2' });
    expect(moved).toMatchObject({ groupId: 'g2', number: 1 });
  });

  it('loescht nur leere Hauptkategorien', async () => {
    groupRepo.findOne.mockResolvedValue({ id: 'g1', organizationId: 'org-1' });
    repo.count.mockResolvedValueOnce(2);
    await expect(service.deleteGroup('g1')).rejects.toThrow(
      AppBadRequestException,
    );
    expect(groupRepo.remove).not.toHaveBeenCalled();

    repo.count.mockResolvedValueOnce(0);
    await service.deleteGroup('g1');
    expect(groupRepo.remove).toHaveBeenCalled();
  });

  describe('Kategorievorlagen', () => {
    it('legt eine Vorlage mit Kategorien der eigenen Organisation an', async () => {
      repo.find.mockResolvedValue([
        { id: 'a', organizationId: 'org-1' },
        { id: 'b', organizationId: 'org-1' },
      ]);
      const template = await service.createTemplate({
        name: ' Holzwerkrenovation ',
        organizationId: 'org-1',
        categoryIds: ['a', 'b'],
      });
      expect(template).toEqual({
        id: 'tpl-1',
        organizationId: 'org-1',
        name: 'Holzwerkrenovation',
        categoryIds: ['a', 'b'],
      });
    });

    it('lehnt Kategorien einer anderen Organisation ab', async () => {
      repo.find.mockResolvedValue([{ id: 'x', organizationId: 'other-org' }]);
      await expect(
        service.createTemplate({
          name: 'T',
          organizationId: 'org-1',
          categoryIds: ['x'],
        }),
      ).rejects.toThrow(AppBadRequestException);
      expect(templateRepo.save).not.toHaveBeenCalled();
    });

    it('ersetzt beim Bearbeiten die Kategorienauswahl', async () => {
      templateRepo.findOne.mockResolvedValue({
        id: 'tpl-1',
        organizationId: 'org-1',
        name: 'T',
        categories: [{ id: 'a' }],
      });
      repo.find.mockResolvedValue([{ id: 'b', organizationId: 'org-1' }]);
      const updated = await service.updateTemplate('tpl-1', {
        categoryIds: ['b'],
      });
      expect(updated.categoryIds).toEqual(['b']);
    });
  });
});
