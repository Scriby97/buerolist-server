import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
  ) {}

  /**
   * @param organizationIds - undefined = kein Org-Filter (nur für Administratoren
   * zulässig), leeres Array = User gehört keiner Organisation an -> keine Kategorien
   */
  async findAll(organizationIds?: string[]): Promise<CategoryEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    return this.repo.find({
      where: organizationIds ? { organizationId: In(organizationIds) } : {},
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CategoryEntity | null> {
    return this.repo.findOne({ where: { id } });
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

  async create(data: {
    name: string;
    organizationId: string;
  }): Promise<CategoryEntity> {
    const category = this.repo.create(data);
    return this.repo.save(category);
  }

  async update(id: string, data: { name: string }): Promise<CategoryEntity> {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_NOT_FOUND,
        `Category with ID ${id} not found`,
        { id },
      );
    }
    Object.assign(category, data);
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
