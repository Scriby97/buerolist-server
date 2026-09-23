import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NoteEntity } from './note.entity';
import { NotePhotoEntity } from './note-photo.entity';
import { CustomerEntity } from '../customers/customer.entity';
import { ProjectEntity } from '../projects/project.entity';
import { NotePhotosService } from './note-photos.service';
import {
  AppBadRequestException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(NoteEntity)
    private readonly repo: Repository<NoteEntity>,
    @InjectRepository(NotePhotoEntity)
    private readonly photoRepo: Repository<NotePhotoEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    private readonly photosService: NotePhotosService,
  ) {}

  async findOne(id: string): Promise<NoteEntity | null> {
    return this.repo.findOne({ where: { id }, relations: ['photos'] });
  }

  /**
   * Ermittelt die Organisation für eine neue Notiz aus ihrem Ziel (Kunde
   * ODER Projekt - genau eines von beiden, siehe CreateNoteDto) und prüft
   * dabei implizit, dass das Ziel existiert.
   */
  async resolveTargetOrganization(
    customerId?: string,
    projectId?: string,
  ): Promise<string> {
    if (!customerId && !projectId) {
      throw new AppBadRequestException(
        ErrorCode.NOTE_TARGET_REQUIRED,
        'Eine Notiz muss entweder einem Kunden oder einem Projekt zugeordnet sein',
      );
    }
    if (customerId && projectId) {
      throw new AppBadRequestException(
        ErrorCode.NOTE_TARGET_REQUIRED,
        'Eine Notiz kann nicht gleichzeitig einem Kunden und einem Projekt zugeordnet sein',
      );
    }

    if (customerId) {
      const customer = await this.customerRepo.findOne({
        where: { id: customerId },
      });
      if (!customer) {
        throw new AppNotFoundException(
          ErrorCode.CUSTOMER_NOT_FOUND,
          `Customer with ID ${customerId} not found`,
          { id: customerId },
        );
      }
      return customer.organizationId;
    }

    // An dieser Stelle ist projectId garantiert gesetzt (customerId/projectId
    // wurden oben als "genau eines von beiden" geprüft) - TS kann das nicht
    // selbst herleiten, daher die lokale, enger typisierte Variable.
    const targetProjectId = projectId!;
    const project = await this.projectRepo.findOne({
      where: { id: targetProjectId },
    });
    if (!project) {
      throw new AppNotFoundException(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${targetProjectId} not found`,
        { id: targetProjectId },
      );
    }
    return project.organizationId;
  }

  async create(data: {
    organizationId: string;
    customerId?: string;
    projectId?: string;
    authorId: string;
    text: string;
  }): Promise<NoteEntity> {
    const note = this.repo.create({
      organizationId: data.organizationId,
      customerId: data.customerId ?? null,
      projectId: data.projectId ?? null,
      authorId: data.authorId,
      text: data.text,
    });
    return this.repo.save(note);
  }

  async addPhoto(
    noteId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<NotePhotoEntity> {
    const note = await this.repo.findOne({ where: { id: noteId } });
    if (!note) {
      throw new AppNotFoundException(
        ErrorCode.NOTE_NOT_FOUND,
        `Note with ID ${noteId} not found`,
        { id: noteId },
      );
    }

    const url = await this.photosService.upload(noteId, file);
    const photo = this.photoRepo.create({ noteId, url });
    return this.photoRepo.save(photo);
  }

  async deletePhoto(noteId: string, photoId: string): Promise<void> {
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, noteId },
    });
    if (!photo) {
      throw new AppNotFoundException(
        ErrorCode.NOTE_PHOTO_INVALID,
        `Photo with ID ${photoId} not found on note ${noteId}`,
        { id: photoId },
      );
    }
    await this.photosService.deleteOne(photo.url);
    await this.photoRepo.remove(photo);
  }

  async delete(id: string): Promise<void> {
    const note = await this.repo.findOne({ where: { id } });
    if (!note) {
      throw new AppNotFoundException(
        ErrorCode.NOTE_NOT_FOUND,
        `Note with ID ${id} not found`,
        { id },
      );
    }
    // Storage-Objekte zuerst entfernen (die DB-Zeilen in note_photos
    // verschwinden ohnehin per ON DELETE CASCADE, aber der Storage-Bucket
    // kennt keine Foreign Keys und würde sonst verwaiste Dateien behalten).
    await this.photosService.deleteAllForNote(id);
    await this.repo.remove(note);
  }
}
