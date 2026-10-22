import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { CategoryGroupEntity } from './category-group.entity';
import {
  AppBadRequestException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';
import { saveWithNextNumber } from '../common/utils/next-number.util';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
    @InjectRepository(CategoryGroupEntity)
    private readonly groupRepo: Repository<CategoryGroupEntity>,
  ) {}

  /**
   * Alle Kategorien inkl. Hauptkategorie, sortiert nach Nummer ("1.01" ...).
   * @param organizationIds - undefined = kein Org-Filter (nur für Administratoren
   * zulässig), leeres Array = User gehört keiner Organisation an -> keine Kategorien
   */
  async findAll(organizationIds?: string[]): Promise<CategoryEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    return this.repo.find({
      where: organizationIds ? { organizationId: In(organizationIds) } : {},
      relations: ['group'],
      order: { group: { number: 'ASC' }, number: 'ASC' },
    });
  }

  /** Hauptkategorien mit ihren Kategorien, beides nach Nummer sortiert. */
  async findGroups(organizationIds?: string[]): Promise<CategoryGroupEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }
    return this.groupRepo.find({
      where: organizationIds ? { organizationId: In(organizationIds) } : {},
      relations: ['categories'],
      order: { number: 'ASC', categories: { number: 'ASC' } },
    });
  }

  async findOne(id: string): Promise<CategoryEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findGroup(id: string): Promise<CategoryGroupEntity | null> {
    return this.groupRepo.findOne({ where: { id } });
  }

  /**
   * Für die Prüfung in ProjectsService, ob alle bei einem Projekt gewählten
   * Kategorien tatsächlich zur selben Organisation gehören.
   */
  async findByIds(ids: string[]): Promise<CategoryEntity[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.repo.find({ where: { id: In(ids) } });
  }

  private async requireGroupInOrganization(
    groupId: string,
    organizationId: string,
  ): Promise<CategoryGroupEntity> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_GROUP_NOT_FOUND,
        `Category group with ID ${groupId} not found`,
        { id: groupId },
      );
    }
    if (group.organizationId !== organizationId) {
      throw new AppBadRequestException(
        ErrorCode.CATEGORY_NOT_IN_YOUR_ORG,
        'Die Hauptkategorie gehört nicht zu dieser Organisation',
      );
    }
    return group;
  }

  async createGroup(data: {
    name: string;
    organizationId: string;
  }): Promise<CategoryGroupEntity> {
    const saved = await saveWithNextNumber(
      () =>
        this.groupRepo.maximum('number', {
          organizationId: data.organizationId,
        }),
      (number) =>
        this.groupRepo.save(
          this.groupRepo.create({
            name: data.name.trim(),
            organizationId: data.organizationId,
            number,
          }),
        ),
    );
    return Object.assign(saved, { categories: [] });
  }

  async updateGroup(
    id: string,
    data: { name: string },
  ): Promise<CategoryGroupEntity> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_GROUP_NOT_FOUND,
        `Category group with ID ${id} not found`,
        { id },
      );
    }
    group.name = data.name.trim();
    return this.groupRepo.save(group);
  }

  /** Nur leere Hauptkategorien lassen sich löschen. */
  async deleteGroup(id: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_GROUP_NOT_FOUND,
        `Category group with ID ${id} not found`,
        { id },
      );
    }
    const count = await this.repo.count({ where: { groupId: id } });
    if (count > 0) {
      throw new AppBadRequestException(
        ErrorCode.CATEGORY_GROUP_NOT_EMPTY,
        'Die Hauptkategorie enthält noch Kategorien',
        { count },
      );
    }
    await this.groupRepo.remove(group);
  }

  async create(data: {
    name: string;
    organizationId: string;
    groupId: string;
  }): Promise<CategoryEntity> {
    const group = await this.requireGroupInOrganization(
      data.groupId,
      data.organizationId,
    );
    const saved = await saveWithNextNumber(
      () => this.repo.maximum('number', { groupId: group.id }),
      (number) =>
        this.repo.save(
          this.repo.create({
            name: data.name.trim(),
            organizationId: data.organizationId,
            groupId: group.id,
            number,
          }),
        ),
    );
    return Object.assign(saved, { group });
  }

  async update(
    id: string,
    data: { name?: string; groupId?: string },
  ): Promise<CategoryEntity> {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_NOT_FOUND,
        `Category with ID ${id} not found`,
        { id },
      );
    }
    if (data.name !== undefined) {
      category.name = data.name.trim();
    }
    if (data.groupId && data.groupId !== category.groupId) {
      // Verschieben: bekommt die naechste Nummer in der neuen Hauptkategorie.
      const group = await this.requireGroupInOrganization(
        data.groupId,
        category.organizationId,
      );
      return saveWithNextNumber(
        () => this.repo.maximum('number', { groupId: group.id }),
        (number) =>
          this.repo.save(
            Object.assign(category, { groupId: group.id, group, number }),
          ),
      );
    }
    return this.repo.save(category);
  }

  async delete(id: string): Promise<void> {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_NOT_FOUND,
        `Category with ID ${id} not found`,
        { id },
      );
    }
    // Zuordnungen zu Projekten (project_categories) und Zeiteinträge, die
    // diese Kategorie referenzieren, hängen per ON DELETE CASCADE bzw.
    // ON DELETE SET NULL an dieser Zeile (siehe Migration) - kein manuelles
    // Aufräumen hier nötig.
    await this.repo.remove(category);
  }
}
