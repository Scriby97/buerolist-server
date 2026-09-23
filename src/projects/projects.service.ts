import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ProjectEntity } from './project.entity';
import { ProjectStatus } from './project-status.enum';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import { CategoryEntity } from '../categories/category.entity';
import { TimeEntryEntity } from '../time-entries/time-entry.entity';
import { NoteEntity } from '../notes/note.entity';
import {
  AppBadRequestException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

export interface ProjectTimeSummaryRow {
  creatorId: string;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  creatorEmail: string | null;
  categoryId: string | null;
  categoryName: string | null;
  totalMinutes: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly repo: Repository<ProjectEntity>,
    @InjectRepository(ProjectCategoryEntity)
    private readonly projectCategoryRepo: Repository<ProjectCategoryEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(TimeEntryEntity)
    private readonly timeEntryRepo: Repository<TimeEntryEntity>,
    @InjectRepository(NoteEntity)
    private readonly noteRepo: Repository<NoteEntity>,
  ) {}

  /**
   * @param organizationIds - undefined = kein Org-Filter (nur für Administratoren
   * zulässig), leeres Array = User gehört keiner Organisation an -> keine Projekte
   */
  async findAll(
    organizationIds?: string[],
    includeArchived = false,
  ): Promise<ProjectEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    return this.repo.find({
      where: {
        ...(organizationIds ? { organizationId: In(organizationIds) } : {}),
        ...(includeArchived ? {} : { archivedAt: IsNull() }),
      },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ProjectEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Anzahl aktiver (nicht abgeschlossener, nicht archivierter) Projekte einer
   * Organisation - für die Durchsetzung des maxProjects-Tarif-Limits.
   */
  async countActive(organizationId: string): Promise<number> {
    return this.repo.count({
      where: {
        organizationId,
        status: ProjectStatus.ACTIVE,
        archivedAt: IsNull(),
      },
    });
  }

  private async loadCategoriesForProject(
    projectId: string,
  ): Promise<CategoryEntity[]> {
    const links = await this.projectCategoryRepo.find({
      where: { projectId },
      relations: ['category'],
    });
    return links.map((l) => l.category);
  }

  /**
   * Projekt-Detailansicht: Projekt inkl. Kunde, gewählter Kategorien, Notizen
   * (mit Fotos) und einer Zeit-Zusammenfassung pro Mitarbeiter/Kategorie.
   */
  async findOneDetailed(id: string): Promise<{
    project: ProjectEntity;
    categories: CategoryEntity[];
    notes: NoteEntity[];
    timeSummary: ProjectTimeSummaryRow[];
  } | null> {
    const project = await this.repo.findOne({
      where: { id },
      relations: ['customer'],
    });
    if (!project) {
      return null;
    }

    const [categories, notes, timeSummary] = await Promise.all([
      this.loadCategoriesForProject(id),
      this.noteRepo.find({
        where: { projectId: id },
        relations: ['photos'],
        order: { createdAt: 'DESC' },
      }),
      this.timeSummary(id),
    ]);

    return { project, categories, notes, timeSummary };
  }

  /**
   * Aggregiert alle Zeiteinträge eines Projekts gruppiert nach Mitarbeiter
   * und Kategorie - reine Summen-Query, keine Paginierung nötig (ein Projekt
   * hat typischerweise wenige Mitarbeiter/Kategorien, nicht tausende Zeilen).
   */
  async timeSummary(projectId: string): Promise<ProjectTimeSummaryRow[]> {
    const raw = await this.timeEntryRepo
      .createQueryBuilder('t')
      .leftJoin('t.creator', 'creator')
      .leftJoin('t.category', 'category')
      .select('t.creatorId', 'creatorId')
      .addSelect('creator.firstName', 'creatorFirstName')
      .addSelect('creator.lastName', 'creatorLastName')
      .addSelect('creator.email', 'creatorEmail')
      .addSelect('t.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect(
        'COALESCE(SUM(EXTRACT(EPOCH FROM (t."endAt" - t."startAt"))) / 60, 0)',
        'totalMinutes',
      )
      .where('t.projectId = :projectId', { projectId })
      .groupBy(
        't.creatorId, creator.firstName, creator.lastName, creator.email, t.categoryId, category.name',
      )
      .orderBy('creator.firstName', 'ASC')
      .getRawMany<{
        creatorId: string;
        creatorFirstName: string | null;
        creatorLastName: string | null;
        creatorEmail: string | null;
        categoryId: string | null;
        categoryName: string | null;
        totalMinutes: string;
      }>();

    return raw.map((r) => ({
      ...r,
      totalMinutes: Math.round(Number(r.totalMinutes) || 0),
    }));
  }

  /**
   * Prüft, dass alle angegebenen Kategorie-IDs existieren und zur selben
   * Organisation gehören wie das Projekt - verhindert, dass ein Projekt
   * versehentlich (oder böswillig per API) die Kategorie-Bibliothek einer
   * anderen Organisation referenziert.
   */
  private async assertCategoriesBelongToOrg(
    categoryIds: string[],
    organizationId: string,
  ): Promise<void> {
    if (categoryIds.length === 0) {
      return;
    }
    const categories = await this.categoryRepo.find({
      where: { id: In(categoryIds) },
    });
    if (categories.length !== categoryIds.length) {
      throw new AppNotFoundException(
        ErrorCode.CATEGORY_NOT_FOUND,
        'Eine oder mehrere Kategorien wurden nicht gefunden',
      );
    }
    const foreign = categories.find((c) => c.organizationId !== organizationId);
    if (foreign) {
      throw new AppBadRequestException(
        ErrorCode.CATEGORY_NOT_IN_YOUR_ORG,
        'Kategorie gehört nicht zur Organisation dieses Projekts',
      );
    }
  }

  async create(data: {
    title: string;
    customerId: string;
    organizationId: string;
    categoryIds?: string[];
  }): Promise<ProjectEntity> {
    const categoryIds = data.categoryIds ?? [];
    await this.assertCategoriesBelongToOrg(categoryIds, data.organizationId);

    const project = this.repo.create({
      title: data.title,
      customerId: data.customerId,
      organizationId: data.organizationId,
    });
    const saved = await this.repo.save(project);

    if (categoryIds.length > 0) {
      await this.projectCategoryRepo.save(
        categoryIds.map((categoryId) =>
          this.projectCategoryRepo.create({ projectId: saved.id, categoryId }),
        ),
      );
    }

    return saved;
  }

  async update(
    id: string,
    data: { title?: string; status?: ProjectStatus; categoryIds?: string[] },
  ): Promise<ProjectEntity> {
    const project = await this.repo.findOne({ where: { id } });
    if (!project) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${id} not found`,
        { id },
      );
    }

    if (data.title !== undefined) {
      project.title = data.title;
    }
    if (data.status !== undefined) {
      project.status = data.status;
    }
    await this.repo.save(project);

    if (data.categoryIds !== undefined) {
      await this.assertCategoriesBelongToOrg(
        data.categoryIds,
        project.organizationId,
      );
      // Vorhandene Zeiteinträge behalten ihre categoryId auch dann, wenn die
      // Kategorie hier aus der Projekt-Auswahl entfernt wird (SET NULL greift
      // nur beim Löschen der Kategorie selbst, nicht hier) - so bleibt die
      // bisherige Zeit-Zusammenfassung historisch korrekt.
      await this.projectCategoryRepo.delete({ projectId: id });
      if (data.categoryIds.length > 0) {
        await this.projectCategoryRepo.save(
          data.categoryIds.map((categoryId) =>
            this.projectCategoryRepo.create({ projectId: id, categoryId }),
          ),
        );
      }
    }

    return project;
  }

  async delete(id: string): Promise<void> {
    const project = await this.repo.findOne({ where: { id } });
    if (!project) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${id} not found`,
        { id },
      );
    }

    const timeEntryCount = await this.timeEntryRepo.count({
      where: { projectId: id },
    });
    if (timeEntryCount > 0) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        `Projekt hat bereits ${timeEntryCount} Zeiteintrag/-einträge und kann nicht gelöscht werden - stattdessen als abgeschlossen markieren`,
        { timeEntryCount },
      );
    }

    await this.repo.remove(project);
  }
}
