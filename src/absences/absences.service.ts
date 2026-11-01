import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbsenceEntity } from './absence.entity';
import { AbsenceReasonEntity } from './absence-reason.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import type { AbsencePortion } from './dto/absence.dto';
import {
  AppConflictException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';
import {
  DEFAULT_WORK_SCHEDULE,
  workdayMinutes,
} from '../common/utils/work-schedule.util';
import { saveWithNextNumber } from '../common/utils/next-number.util';

type PersonRef = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  isPlaceholder?: boolean;
};

/** Abwesenheit fuer die API (ohne interne Profilfelder). */
export interface AbsenceResponse {
  id: string;
  organizationId: string;
  creatorId: string;
  date: string;
  minutes: number;
  comment: string | null;
  /** Vordefinierter Grund (id, number) oder eigener (id/number null) */
  reason: { id: string | null; number: number | null; name: string };
  creator: PersonRef;
  /** Wer erfasst hat, falls nicht die Person selbst */
  createdBy: PersonRef | null;
}

export interface NewAbsence {
  organizationId: string;
  creatorId: string;
  createdById: string;
  reasonId: string | null;
  reasonText: string | null;
  date: string;
  minutes: number;
  comment: string | null;
}

const person = (p: UserProfileEntity): PersonRef => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  email: p.email,
  isPlaceholder: p.isPlaceholder,
});

@Injectable()
export class AbsencesService {
  constructor(
    @InjectRepository(AbsenceEntity)
    private readonly absenceRepo: Repository<AbsenceEntity>,
    @InjectRepository(AbsenceReasonEntity)
    private readonly reasonRepo: Repository<AbsenceReasonEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profileRepo: Repository<UserProfileEntity>,
  ) {}

  // --- Gruende -------------------------------------------------------------

  findReasons(organizationId: string): Promise<AbsenceReasonEntity[]> {
    return this.reasonRepo.find({
      where: { organizationId },
      order: { number: 'ASC' },
    });
  }

  async findReason(id: string): Promise<AbsenceReasonEntity> {
    const reason = await this.reasonRepo.findOne({ where: { id } });
    if (!reason) {
      throw new AppNotFoundException(
        ErrorCode.ABSENCE_REASON_NOT_FOUND,
        'Abwesenheitsgrund nicht gefunden',
        { id },
      );
    }
    return reason;
  }

  /** Neuer Grund mit der naechsten Nummer (A-xxx). */
  createReason(
    organizationId: string,
    name: string,
  ): Promise<AbsenceReasonEntity> {
    return saveWithNextNumber(
      () => this.reasonRepo.maximum('number', { organizationId }),
      (number) =>
        this.reasonRepo.save(
          this.reasonRepo.create({ organizationId, name: name.trim(), number }),
        ),
    );
  }

  async updateReason(id: string, name: string): Promise<AbsenceReasonEntity> {
    const reason = await this.findReason(id);
    reason.name = name.trim();
    return this.reasonRepo.save(reason);
  }

  /** Nur moeglich, solange keine Abwesenheit den Grund verwendet. */
  async removeReason(id: string): Promise<void> {
    const reason = await this.findReason(id);
    const used = await this.absenceRepo.count({ where: { reasonId: id } });
    if (used > 0) {
      throw new AppConflictException(
        ErrorCode.ABSENCE_REASON_IN_USE,
        'Dieser Grund wird noch verwendet',
        { count: used },
      );
    }
    await this.reasonRepo.remove(reason);
  }

  // --- Abwesenheiten -------------------------------------------------------

  /**
   * Dauer in Minuten: ganzer bzw. halber Tag nach den Arbeitszeiten der
   * Person (siehe migrations/013), sonst die angegebenen Minuten.
   */
  async minutesFor(
    userId: string,
    portion: AbsencePortion,
    minutes?: number,
  ): Promise<number> {
    if (portion === 'hours') return minutes ?? 0;
    const profile = await this.profileRepo.findOne({ where: { id: userId } });
    const day = workdayMinutes(profile ?? DEFAULT_WORK_SCHEDULE);
    return portion === 'full' ? day : Math.round(day / 2);
  }

  async findAll(filter: {
    organizationIds?: string[];
    creatorId?: string;
    from?: string;
    to?: string;
  }): Promise<AbsenceResponse[]> {
    const qb = this.absenceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.reason', 'reason')
      .innerJoinAndSelect('a.creator', 'creator')
      .leftJoinAndSelect('a.createdBy', 'createdBy')
      .orderBy('a.date', 'DESC')
      .addOrderBy('a.createdAt', 'ASC');
    if (filter.organizationIds) {
      if (filter.organizationIds.length === 0) return [];
      qb.andWhere('a.organizationId IN (:...orgIds)', {
        orgIds: filter.organizationIds,
      });
    }
    if (filter.creatorId) {
      qb.andWhere('a.creatorId = :creatorId', { creatorId: filter.creatorId });
    }
    if (filter.from) qb.andWhere('a.date >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('a.date <= :to', { to: filter.to });
    return (await qb.getMany()).map((a) => this.toResponse(a));
  }

  async findOne(id: string): Promise<AbsenceEntity> {
    const absence = await this.absenceRepo.findOne({
      where: { id },
      relations: { reason: true, creator: true, createdBy: true },
    });
    if (!absence) {
      throw new AppNotFoundException(
        ErrorCode.ABSENCE_NOT_FOUND,
        'Abwesenheit nicht gefunden',
        { id },
      );
    }
    return absence;
  }

  /** Legt alle Abwesenheiten in einer Transaktion an (alles oder nichts). */
  async createMany(records: NewAbsence[]): Promise<AbsenceResponse[]> {
    const ids = await this.absenceRepo.manager.transaction(async (manager) => {
      const saved = await manager.save(
        AbsenceEntity,
        records.map((r) => manager.create(AbsenceEntity, r)),
      );
      return saved.map((a) => a.id);
    });
    const created = await Promise.all(ids.map((id) => this.findOne(id)));
    return created.map((a) => this.toResponse(a));
  }

  async update(
    id: string,
    patch: {
      reasonId?: string;
      reasonText?: string;
      date?: string;
      minutes?: number;
      comment?: string | null;
    },
  ): Promise<AbsenceResponse> {
    await this.findOne(id);
    const changes: Partial<AbsenceEntity> = {};
    // Entweder vordefinierter oder eigener Grund
    if (patch.reasonId) {
      changes.reasonId = patch.reasonId;
      changes.reasonText = null;
    } else if (patch.reasonText?.trim()) {
      changes.reasonId = null;
      changes.reasonText = patch.reasonText.trim();
    }
    if (patch.date !== undefined) changes.date = patch.date;
    if (patch.minutes !== undefined) changes.minutes = patch.minutes;
    if (patch.comment !== undefined) {
      changes.comment = patch.comment?.trim() || null;
    }
    if (Object.keys(changes).length > 0) {
      await this.absenceRepo.update({ id }, changes);
    }
    return this.toResponse(await this.findOne(id));
  }

  async remove(id: string): Promise<void> {
    await this.absenceRepo.delete({ id });
  }

  toResponse(a: AbsenceEntity): AbsenceResponse {
    return {
      id: a.id,
      organizationId: a.organizationId,
      creatorId: a.creatorId,
      date: a.date,
      minutes: a.minutes,
      comment: a.comment,
      reason: a.reason
        ? { id: a.reason.id, number: a.reason.number, name: a.reason.name }
        : { id: null, number: null, name: a.reasonText ?? '' },
      creator: person(a.creator),
      createdBy:
        a.createdBy && a.createdById !== a.creatorId
          ? person(a.createdBy)
          : null,
    };
  }
}
