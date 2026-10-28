import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { TimeEntryEntity } from './time-entry.entity';
import {
  TimeEntryItemEntity,
  type TimeEntryItemType,
} from './time-entry-item.entity';
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

export interface TimeEntryItemInput {
  type: TimeEntryItemType;
  quantity: number;
  description: string;
  unitPriceRappen: number;
}

export interface TimeEntryItemView {
  id: string;
  type: TimeEntryItemType;
  quantity: number;
  description: string;
  unitPriceRappen: number;
}

function toItemView(item: TimeEntryItemEntity): TimeEntryItemView {
  return {
    id: item.id,
    type: item.type,
    quantity: Number(item.quantity),
    description: item.description,
    unitPriceRappen: item.unitPriceRappen,
  };
}

export interface TimeEntryWithProject {
  id: string;
  projectId: string;
  categoryId: string | null;
  creatorId: string;
  startAt: Date;
  endAt: Date;
  comment: string | null;
  /** Fahrzeit in Minuten (null = keine) */
  travelMinutes: number | null;
  items: TimeEntryItemView[];
  project: {
    id: string;
    title: string;
    number: number;
    customerId: string;
    customerName: string;
    customerNumber: number;
  };
  category: { id: string; name: string } | null;
  creator: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string | null;
  };
  /** Nur gesetzt, wenn jemand anderes (Admin/Owner) den Eintrag erfasst hat */
  createdBy: { id: string; firstName?: string; lastName?: string } | null;
}

// Leere/nur-Leerzeichen-Bemerkungen nicht als '' speichern, sondern als null.
function normalizeComment(comment?: string | null): string | null {
  const trimmed = comment?.trim();
  return trimmed ? trimmed : null;
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
    @InjectRepository(TimeEntryItemEntity)
    private readonly itemRepo: Repository<TimeEntryItemEntity>,
  ) {}

  /** Positionen mehrerer Eintraege in einer Abfrage, gruppiert nach Eintrag. */
  private async loadItems(
    timeEntryIds: string[],
  ): Promise<Map<string, TimeEntryItemView[]>> {
    const byEntry = new Map<string, TimeEntryItemView[]>();
    if (timeEntryIds.length === 0) return byEntry;
    const items = await this.itemRepo.find({
      where: { timeEntryId: In(timeEntryIds) },
      order: { position: 'ASC' },
    });
    for (const item of items) {
      const list = byEntry.get(item.timeEntryId) ?? [];
      list.push(toItemView(item));
      byEntry.set(item.timeEntryId, list);
    }
    return byEntry;
  }

  /** Ersetzt alle Positionen eines Eintrags (Reihenfolge wie uebergeben). */
  private async replaceItems(
    timeEntryId: string,
    items: TimeEntryItemInput[],
  ): Promise<TimeEntryItemView[]> {
    await this.itemRepo.delete({ timeEntryId });
    if (items.length === 0) return [];
    const saved = await this.itemRepo.save(
      items.map((item, index) =>
        this.itemRepo.create({
          timeEntryId,
          type: item.type,
          position: index,
          quantity: item.quantity,
          description: item.description.trim(),
          unitPriceRappen: item.unitPriceRappen,
        }),
      ),
    );
    return saved.map(toItemView);
  }

  /**
   * Zeiteinträge mit Projekt-/Kategorie-/Ersteller-Daten, cursor-paginiert
   * (neueste zuerst) - direktes Pendant zu UsagesService.findAllWithVehicles.
   * @param organizationIds - undefined = kein Filter (nur Administratoren),
   *   leeres Array = keine Organisation -> keine Zeiteinträge
   * @param creatorId - falls gesetzt (normale Mitarbeiter), zusätzlich auf
   *   die eigenen Einträge einschränken
   * @param projectId - optional: nur Einträge eines bestimmten Projekts
   *   (für die Projekt-Detailansicht / Zeit-Zusammenfassung)
   * @param startDate/endDate - optional, beide zusammen: nur Einträge mit
   *   startAt in diesem Zeitraum (Kalenderansicht)
   */
  async findAllWithProject(
    organizationIds?: string[],
    creatorId?: string,
    projectId?: string,
    limit?: number,
    cursor?: TimeEntryCursor,
    startDate?: Date,
    endDate?: Date,
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
      .leftJoinAndSelect('t.createdBy', 'createdBy')
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
    if (startDate && endDate) {
      qb.andWhere('t.startAt >= :startDate AND t.startAt <= :endDate', {
        startDate,
        endDate,
      });
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
    // Positionen separat laden (ein Join wuerde das limit der Paginierung
    // verfaelschen, weil es Zeilen statt Eintraege zaehlt).
    const itemsByEntry = await this.loadItems(entries.map((t) => t.id));
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
      comment: t.comment ?? null,
      travelMinutes: t.travelMinutes ?? null,
      items: itemsByEntry.get(t.id) ?? [],
      project: {
        id: t.project.id,
        title: t.project.title,
        number: t.project.number,
        customerId: t.project.customerId,
        customerName: t.project.customer.name,
        customerNumber: t.project.customer.number,
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
      createdBy:
        t.createdBy && t.createdById !== t.creatorId
          ? {
              id: t.createdBy.id,
              firstName: t.createdBy.firstName,
              lastName: t.createdBy.lastName,
            }
          : null,
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

  /**
   * Verhindert, dass dieselbe Person einen Zeitraum doppelt verbucht - auch
   * nicht auf verschiedenen Projekten (man kann nicht an zwei Orten
   * gleichzeitig arbeiten). Aneinandergrenzende Einträge (07:00-09:00 und
   * 09:00-11:00) sind erlaubt. Die DB-Constraint time_entries_no_overlap
   * (migrations/003) fängt zusätzlich gleichzeitige Requests ab.
   * @param excludeId - beim Bearbeiten: der Eintrag selbst zählt nicht
   */
  private async assertNoOverlap(
    creatorId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const overlapping = await this.repo.findOne({
      where: {
        creatorId,
        startAt: LessThan(endAt),
        endAt: MoreThan(startAt),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (overlapping) {
      throw this.overlapException();
    }
  }

  private overlapException(): AppBadRequestException {
    return new AppBadRequestException(
      ErrorCode.TIME_ENTRY_OVERLAP,
      'Für diesen Zeitraum ist bereits ein Zeiteintrag erfasst',
    );
  }

  /**
   * Speichert und übersetzt eine Verletzung der Overlap-Constraint (Postgres
   * 23P01, nur bei gleichzeitigen Requests möglich) in denselben Fehler wie
   * assertNoOverlap.
   */
  private async saveChecked(entry: TimeEntryEntity): Promise<TimeEntryEntity> {
    try {
      return await this.repo.save(entry);
    } catch (err) {
      const e = err as { code?: string; driverError?: { code?: string } };
      if (e.code === '23P01' || e.driverError?.code === '23P01') {
        throw this.overlapException();
      }
      throw err;
    }
  }

  async create(data: {
    projectId: string;
    categoryId?: string | null;
    creatorId: string;
    /** Wer erfasst (Admin/Owner fuer jemand anderen) - sonst = creatorId */
    createdById?: string;
    startAt: Date;
    endAt: Date;
    comment?: string | null;
    travelMinutes?: number | null;
    items?: TimeEntryItemInput[];
  }): Promise<TimeEntryEntity & { items: TimeEntryItemView[] }> {
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
    await this.assertNoOverlap(data.creatorId, data.startAt, data.endAt);

    const { items, ...entryData } = data;
    const entry = this.repo.create({
      ...entryData,
      travelMinutes: data.travelMinutes || null,
      comment: normalizeComment(data.comment),
    } as DeepPartial<TimeEntryEntity>);
    const saved = await this.saveChecked(entry);
    const savedItems = items?.length
      ? await this.replaceItems(saved.id, items)
      : [];
    return Object.assign(saved, { items: savedItems });
  }

  async update(
    id: string,
    data: {
      categoryId?: string | null;
      startAt?: Date;
      endAt?: Date;
      comment?: string | null;
      travelMinutes?: number | null;
      items?: TimeEntryItemInput[];
    },
  ): Promise<TimeEntryEntity & { items: TimeEntryItemView[] }> {
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
    await this.assertNoOverlap(
      entry.creatorId,
      nextStartAt,
      nextEndAt,
      entry.id,
    );

    entry.startAt = nextStartAt;
    entry.endAt = nextEndAt;
    entry.categoryId = nextCategoryId;
    if (data.comment !== undefined) {
      entry.comment = normalizeComment(data.comment);
    }
    if (data.travelMinutes !== undefined) {
      entry.travelMinutes = data.travelMinutes || null;
    }
    const saved = await this.saveChecked(entry);
    const items =
      data.items !== undefined
        ? await this.replaceItems(id, data.items)
        : ((await this.loadItems([id])).get(id) ?? []);
    return Object.assign(saved, { items });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
