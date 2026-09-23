import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AppBadRequestException,
  AppInternalServerErrorException,
  ErrorCode,
} from '../common/exceptions';

const BUCKET = 'organization-logos';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// Client verkleinert bereits auf 512x512/WebP; das hier ist nur die
// serverseitige Absicherung.
const MAX_BYTES = 3 * 1024 * 1024;

export interface UploadableLogo {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class OrganizationLogoService {
  private readonly logger = new Logger(OrganizationLogoService.name);
  private bucketReady = false;

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Legt den Storage-Bucket einmalig an (idempotent). Wird lazy beim ersten
   * Upload aufgerufen, damit der Serverstart nicht an Storage-Rechten haengt.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;

    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin.storage.createBucket(BUCKET, {
      public: true,
    });

    // "Bucket already exists" ist der Normalfall nach dem ersten Mal
    // (Supabase: "The resource already exists" / "Duplicate name").
    if (error && !/exist|duplicate/i.test(error.message)) {
      this.logger.error(`createBucket fehlgeschlagen: ${error.message}`);
      throw new AppInternalServerErrorException(
        ErrorCode.ORG_LOGO_INVALID,
        'Logo-Speicher konnte nicht initialisiert werden',
      );
    }

    this.bucketReady = true;
  }

  private assertValid(file: UploadableLogo): string {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new AppBadRequestException(
        ErrorCode.ORG_LOGO_INVALID,
        'Nur PNG-, JPEG- oder WebP-Bilder sind erlaubt',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new AppBadRequestException(
        ErrorCode.ORG_LOGO_INVALID,
        'Das Bild ist zu gross (max. 3 MB)',
      );
    }
    return ext;
  }

  /**
   * Entfernt alle bereits vorhandenen Logo-Objekte der Organisation (Prefix
   * `${organizationId}/`). Wird vor jedem neuen Upload und beim Loeschen genutzt.
   */
  private async removeExisting(organizationId: string): Promise<void> {
    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(organizationId);

    if (error) {
      this.logger.warn(
        `list(${organizationId}) fehlgeschlagen: ${error.message}`,
      );
      return;
    }
    if (!data || data.length === 0) return;

    const paths = data.map((obj) => `${organizationId}/${obj.name}`);
    const { error: removeError } = await admin.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) {
      this.logger.warn(
        `remove(${organizationId}) fehlgeschlagen: ${removeError.message}`,
      );
    }
  }

  /**
   * Laedt ein neues Logo hoch (ersetzt ein vorhandenes) und gibt die
   * oeffentliche URL zurueck.
   */
  async uploadLogo(
    organizationId: string,
    file: UploadableLogo,
  ): Promise<string> {
    const ext = this.assertValid(file);
    await this.ensureBucket();
    await this.removeExisting(organizationId);

    const admin = this.supabaseService.getAdminClient();
    const path = `${organizationId}/${Date.now()}.${ext}`;

    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      this.logger.error(`upload(${path}) fehlgeschlagen: ${error.message}`);
      throw new AppInternalServerErrorException(
        ErrorCode.ORG_LOGO_INVALID,
        'Logo konnte nicht gespeichert werden',
      );
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async deleteLogo(organizationId: string): Promise<void> {
    await this.ensureBucket();
    await this.removeExisting(organizationId);
  }
}
