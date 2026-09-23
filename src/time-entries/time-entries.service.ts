import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { TimeEntryEntity } from './time-entry.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import {
  AppBadRequestException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';
import {
  encodeTimeEntryCursor,
  type TimeEntryCursor,
} from './time-entry-cursor.util';

export interface TimeEntryWithProject {
  id: string;
  projectId: string;
  categoryId: string | null;
  creatorId: string;
  startAt: Date;
  endAt: Date;
  project: {
    id: string;
    title: string;
    customerId: string;
    customerName: string;
  };
  category: { id: string; name: string } | null;
  creator: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
}

@Injectable()
export class TimeEntriesService {
  constructor(
    @InjectRepository(TimeEntryEntity)
    private readonly repo: Repository<TimeEntryEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(ProjectCategoryEntity)
    private readonly projectCategoryRepo: Repository<ProjectCategoryEntity>,
  ) {}

  /**
   * Zeiteinträge mit Projekt-/Kategorie-/Ersteller-Daten, cursor-paginiert
   * (neueste zuerst) - direktes Pendant zu UsagesService.findAllWithVehicles.
   * @param organizationIds - undefined = kein Filter (nur Administratoren),
   *   leeres Array = keine Organisation -> keine Zeiteinträge
   * @param creatorId - falls gesetzt (normale Mitarbeiter), zusätzlich auf
   *   die eigenen Einträge einschränken
   * @param projectId - optional: nur Einträge eines bestimmten Projekts
   *   (für die Projekt-Detailansicht / Zeit-Zusammenfassung)
   */
  async findAllWithProject(
    organizationIds?: string[],
    creatorId?: string,
    projectId?: string,
    limit?: number,
    cursor?: TimeEntryCursor,
  ): Promise<{
    timeEntries: TimeEntryWithProject[];
    nextCursor: string | null;
  }> {
    if (organizationIds && organizationIds.length === 0) {
      return { timeEntries: [], nextCursor: null };
    }

    const qb = this.repo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.project', 'project')
      .innerJoinAndSelect('project.customer', 'customer')
      .innerJoinAndSelect('t.creator', 'creator')
      .leftJoinAndSelect('t.category', 'category')
      .orderBy('t.startAt', 'DESC')
      .addOrderBy('t.id', 'DESC');

    if (organizationIds) {
      qb.andWhere('project.organizationId IN (:...organizationIds)', {
        organizationIds,
      });
    }
    if (creatorId) {
      qb.andWhere('t.creatorId = :creatorId', { creatorId });
    }
    if (projectId) {
      qb.andWhere('t.projectId = :projectId', { projectId });
    }
    if (cursor) {
      qb.andWhere(
        '(t.startAt, t.id) < (:cursorStart, CAST(:cursorId AS uuid))',
        { cursorStart: cursor.startAt, cursorId: cursor.id },
      );
    }
    if (limit) {
      qb.limit(limit + 1);
    }

    const fetched = await qb.getMany();
    const hasMore = limit !== undefined && fetched.length > limit;
    const entries = hasMore ? fetched.slice(0, limit) : fetched;
    const last = entries[entries.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeTimeEntryCursor({ startAt: last.startAt, id: last.id })
        : null;

    const items: TimeEntryWithProject[] = entries.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      categoryId: t.categoryId ?? null,
      creatorId: t.creatorId,
      startAt: t.startAt,
      endAt: t.endAt,
      project: {
        id: t.project.id,
        title: t.project.title,
        customerId: t.project.customerId,
        customerName: t.project.customer.name,
      },
      category: t.category
        ? { id: t.category.id, name: t.category.name }
        : null,
      creator: {
        id: t.creator.id,
        firstName: t.creator.firstName,
        lastName: t.creator.lastName,
        email: t.creator.email,
      },
    }));

    return { timeEntries: items, nextCursor };
  }

  /**
   * Ein einzelner Zeiteintrag inkl. Projekt abrufen (ohne Org-/Rechte-Check -
   * Aufrufer prüft Berechtigung, siehe TimeEntriesController).
   */
  async findOne(id: string): Promise<TimeEntryEntity | null> {
    return this.repo.findOne({ where: { id }, relations: ['project'] });
  }

  /**
   * Prüft, dass ein Zeiteintrag zeitlich gültig ist (endAt nach startAt) und
   * - falls eine Kategorie angegeben wurde - dass diese tatsächlich zu den
   * für das Projekt gewählten Kategorien gehört (siehe ProjectCategoryEntity).
   */
  private async assertValid(
    projectId: string,
    startAt: Date,
    endAt: Date,
    categoryId?: string | null,
  ): Promise<void> {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new AppBadRequestException(
        ErrorCode.TIME_ENTRY_END_BEFORE_START,
        'Die Endzeit muss nach der Startzeit liegen',
      );
    }

    if (categoryId) {
      const link = await this.projectCategoryRepo.findOne({
        where: { projectId, categoryId },
      });
      if (!link) {
        throw new AppBadRequestException(
          ErrorCode.TIME_ENTRY_CATEGORY_NOT_ALLOWED,
          'Diese Kategorie ist für das Projekt nicht ausgewählt',
        );
      }
    }
  }

  async create(data: {
    projectId: string;
    categoryId?: string | null;
    creatorId: string;
    startAt: Date;
    endAt: Date;
  }): Promise<TimeEntryEntity> {
    const project = await this.projectRepo.findOne({
      where: { id: data.projectId },
    });
    if (!project) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${data.projectId} not found`,
        { id: data.projectId },
      );
    }

    await this.assertValid(
      data.projectId,
      data.startAt,
      data.endAt,
      data.categoryId,
    );

    const entry = this.repo.create(data as DeepPartial<TimeEntryEntity>);
    return this.repo.save(entry);
  }

  async update(
    id: string,
    data: {
      categoryId?: string | null;
      startAt?: Date;
      endAt?: Date;
    },
  ): Promise<TimeEntryEntity> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) {
      throw new AppNotFoundException(
        ErrorCode.TIME_ENTRY_NOT_FOUND,
        `Time entry with ID ${id} not found`,
        { id },
      );
    }

    const nextStartAt = data.startAt ?? entry.startAt;
    const nextEndAt = data.endAt ?? entry.endAt;
    const nextCategoryId =
      data.categoryId !== undefined ? data.categoryId : entry.categoryId;

    await this.assertValid(
      entry.projectId,
      nextStartAt,
      nextEndAt,
      nextCategoryId,
    );

    entry.startAt = nextStartAt;
    entry.endAt = nextEndAt;
    entry.categoryId = nextCategoryId;
    return this.repo.save(entry);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
