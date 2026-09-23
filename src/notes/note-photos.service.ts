import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AppBadRequestException,
  AppInternalServerErrorException,
  ErrorCode,
} from '../common/exceptions';

const BUCKET = 'note-photos';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// Client verkleinert bereits (analog zum Organisations-Logo); hier nur die
// serverseitige Absicherung - Baustellenfotos duerfen deutlich groesser sein
// als ein Logo, daher grosszuegigeres Limit.
const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadablePhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Foto-Upload/-Loeschung fuer Notizen (mehrere Fotos pro Notiz, anders als
 * das eine Logo pro Organisation) - gleiches Bucket-Muster wie
 * OrganizationLogoService, aber ohne removeExisting (Fotos werden ergaenzt,
 * nicht ersetzt).
 */
@Injectable()
export class NotePhotosService {
  private readonly logger = new Logger(NotePhotosService.name);
  private bucketReady = false;

  constructor(private readonly supabaseService: SupabaseService) {}

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;

    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin.storage.createBucket(BUCKET, {
      public: true,
    });

    if (error && !/exist|duplicate/i.test(error.message)) {
      this.logger.error(`createBucket fehlgeschlagen: ${error.message}`);
      throw new AppInternalServerErrorException(
        ErrorCode.NOTE_PHOTO_INVALID,
        'Foto-Speicher konnte nicht initialisiert werden',
      );
    }

    this.bucketReady = true;
  }

  private assertValid(file: UploadablePhoto): string {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new AppBadRequestException(
        ErrorCode.NOTE_PHOTO_INVALID,
        'Nur PNG-, JPEG- oder WebP-Bilder sind erlaubt',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new AppBadRequestException(
        ErrorCode.NOTE_PHOTO_INVALID,
        'Das Bild ist zu gross (max. 10 MB)',
      );
    }
    return ext;
  }

  async upload(noteId: string, file: UploadablePhoto): Promise<string> {
    const ext = this.assertValid(file);
    await this.ensureBucket();

    const admin = this.supabaseService.getAdminClient();
    const path = `${noteId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype });

    if (error) {
      this.logger.error(`upload(${path}) fehlgeschlagen: ${error.message}`);
      throw new AppInternalServerErrorException(
        ErrorCode.NOTE_PHOTO_INVALID,
        'Foto konnte nicht gespeichert werden',
      );
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Entfernt alle Fotos einer Notiz aus dem Storage (Prefix `${noteId}/`) -
   * wird beim Löschen der Notiz selbst aufgerufen, die Zeilen in
   * note_photos verschwinden über ON DELETE CASCADE von selbst.
   */
  async deleteAllForNote(noteId: string): Promise<void> {
    await this.ensureBucket();
    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).list(noteId);
    if (error) {
      this.logger.warn(`list(${noteId}) fehlgeschlagen: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    const paths = data.map((obj) => `${noteId}/${obj.name}`);
    const { error: removeError } = await admin.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) {
      this.logger.warn(
        `remove(${noteId}) fehlgeschlagen: ${removeError.message}`,
      );
    }
  }

  /**
   * Entfernt ein einzelnes Foto aus dem Storage - `url` ist die zuvor per
   * getPublicUrl() gelieferte oeffentliche URL, daraus wird der Storage-Pfad
   * zurueckgewonnen (alles nach `/object/public/${BUCKET}/`).
   */
  async deleteOne(url: string): Promise<void> {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) {
      this.logger.warn(`deleteOne: unerwartetes URL-Format (${url})`);
      return;
    }
    const path = url.slice(idx + marker.length);

    await this.ensureBucket();
    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin.storage.from(BUCKET).remove([path]);
    if (error) {
      this.logger.warn(`remove(${path}) fehlgeschlagen: ${error.message}`);
    }
  }
}
