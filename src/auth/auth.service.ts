import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SupabaseService } from '../supabase/supabase.service';
import { UserProfileEntity } from './entities/user-profile.entity';
import { OrganizationMemberEntity } from '../organizations/organization-member.entity';
import { UserRole } from './enums/user-role.enum';
import {
  AppForbiddenException,
  AppUnauthorizedException,
  ErrorCode,
} from '../common/exceptions';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private supabaseService: SupabaseService,
    @InjectRepository(UserProfileEntity)
    private profileRepo: Repository<UserProfileEntity>,
    // Direkte Repository-Injektion (statt OrganizationMembersService) - das
    // OrganizationsModule importiert bereits AuthModule, ein Import in
    // Gegenrichtung waere zirkulaer. Gleiches Muster wie OrganizationGuard.
    @InjectRepository(OrganizationMemberEntity)
    private memberRepo: Repository<OrganizationMemberEntity>,
  ) {}

  /**
   * Übersetzt Supabase-SDK-Fehlermeldungen (immer Englisch) in einen unserer
   * ErrorCodes + eine deutsche Fallback-Message. Das Frontend übersetzt den
   * Code anhand der aktuellen UI-Sprache; ist kein Code bekannt, dient die
   * rohe (englische) Supabase-Message als letzter Fallback - sinnvoller als
   * hartes Deutsch, falls Supabase mal eine unbekannte Meldung liefert.
   */
  private translateSupabaseError(errorMessage: string): {
    code: ErrorCode;
    message: string;
  } {
    const errorTranslations: {
      [key: string]: { code: ErrorCode; message: string };
    } = {
      'Email not confirmed': {
        code: ErrorCode.AUTH_EMAIL_NOT_CONFIRMED,
        message:
          'E-Mail-Adresse wurde noch nicht bestätigt. Bitte überprüfen Sie Ihr Postfach.',
      },
      'Invalid login credentials': {
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message:
          'Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.',
      },
      'User already registered': {
        code: ErrorCode.AUTH_USER_ALREADY_REGISTERED,
        message: 'Benutzer ist bereits registriert.',
      },
      'Password should be at least 6 characters': {
        code: ErrorCode.AUTH_PASSWORD_TOO_SHORT,
        message: 'Das Passwort muss mindestens 6 Zeichen lang sein.',
      },
      'Unable to validate email address': {
        code: ErrorCode.AUTH_INVALID_EMAIL,
        message: 'E-Mail-Adresse konnte nicht validiert werden.',
      },
      'Invalid email': {
        code: ErrorCode.AUTH_INVALID_EMAIL,
        message: 'Ungültige E-Mail-Adresse.',
      },
      'Signup requires a valid password': {
        code: ErrorCode.AUTH_SIGNUP_INVALID_PASSWORD,
        message: 'Registrierung erfordert ein gültiges Passwort.',
      },
      'Invalid Refresh Token': {
        code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Ungültiger Refresh-Token. Bitte melden Sie sich erneut an.',
      },
      'User not found': {
        code: ErrorCode.AUTH_USER_NOT_FOUND,
        message: 'Benutzer nicht gefunden.',
      },
      'Email rate limit exceeded': {
        code: ErrorCode.AUTH_EMAIL_RATE_LIMIT,
        message:
          'Zu viele E-Mail-Anfragen. Bitte versuchen Sie es später erneut.',
      },
      'Invalid token': {
        code: ErrorCode.AUTH_TOKEN_INVALID,
        message: 'Ungültiger Token.',
      },
      'Token has expired': {
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: 'Token ist abgelaufen. Bitte melden Sie sich erneut an.',
      },
    };

    // Suche nach passendem Code (Supabase-Message enthält den Schlüssel als Substring)
    for (const [englishError, translation] of Object.entries(
      errorTranslations,
    )) {
      if (errorMessage.includes(englishError)) {
        return translation;
      }
    }

    // Falls kein bekannter Fehler gefunden wurde, gebe die Original-Nachricht
    // (Englisch, von Supabase) als Fallback zurück - Verhalten wie zuvor.
    return { code: ErrorCode.AUTH_GENERIC_ERROR, message: errorMessage };
  }

  private getResetPasswordRedirectUrl(): string | undefined {
    const explicit = process.env.FRONTEND_RESET_PASSWORD_URL?.trim();
    if (explicit) {
      return explicit;
    }

    const base = process.env.FRONTEND_URL?.trim();
    if (!base) {
      return undefined;
    }

    return base.endsWith('/')
      ? `${base}reset-password`
      : `${base}/reset-password`;
  }

  /**
   * Login mit Email und Passwort
   */
  async signIn(email: string, password: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const translated = this.translateSupabaseError(error.message);
      throw new AppUnauthorizedException(translated.code, translated.message);
    }

    // Hole User-Profile mit globaler Rolle
    const profile = await this.profileRepo.findOne({
      where: { id: data.user.id },
    });

    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: {
        ...data.user,
        role: profile?.role || UserRole.USER,
      },
    };
  }

  /**
   * Registrierung mit Email und Passwort
   * Neue User bekommen standardmäßig die Rolle "user" (kein Administrator)
   */
  async signUp(
    email: string,
    password: string,
    metadata?: { firstName?: string; lastName?: string },
    role: UserRole = UserRole.USER,
  ) {
    // Prüfe ob User bereits existiert
    const existingProfile = await this.profileRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (existingProfile) {
      throw new AppUnauthorizedException(
        ErrorCode.AUTH_USER_ALREADY_REGISTERED,
        'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits. Bitte verwenden Sie eine andere E-Mail oder kontaktieren Sie den Support.',
      );
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...metadata,
          role,
        },
      },
    });

    if (error) {
      const translated = this.translateSupabaseError(error.message);
      throw new AppUnauthorizedException(translated.code, translated.message);
    }

    // Erstelle User-Profile in lokaler DB
    if (data.user) {
      const profile = this.profileRepo.create({
        id: data.user.id,
        email: data.user.email!,
        role,
        firstName: metadata?.firstName,
        lastName: metadata?.lastName,
      });
      await this.profileRepo.save(profile);
    }

    return {
      user: data.user,
      session: data.session,
      profile: await this.profileRepo.findOne({ where: { id: data.user?.id } }),
    };
  }

  /**
   * Token refresh
   */
  async refreshToken(refreshToken: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      const translated = this.translateSupabaseError(error.message);
      throw new AppUnauthorizedException(translated.code, translated.message);
    }

    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    };
  }

  /**
   * Sign Out
   */
  async signOut(accessToken: string) {
    const supabase = this.supabaseService.getAuthenticatedClient(accessToken);
    const { error } = await supabase.auth.signOut();

    if (error) {
      const translated = this.translateSupabaseError(error.message);
      throw new AppUnauthorizedException(translated.code, translated.message);
    }

    return { message: 'Erfolgreich abgemeldet' };
  }

  /**
   * Passwort zurücksetzen (Email senden)
   */
  async resetPassword(email: string) {
    const supabase = this.supabaseService.getClient();
    const redirectTo = this.getResetPasswordRedirectUrl();

    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, options);

    if (error) {
      const translated = this.translateSupabaseError(error.message);
      throw new AppUnauthorizedException(translated.code, translated.message);
    }

    return { message: 'Passwort-Reset Email versendet' };
  }

  /**
   * Admin: Passwort-Reset Email an einen User senden
   * Nur Administratoren dürfen alle User, normale User dürfen keine Passwort-Resets machen
   */
  async adminResetPasswordByUserId(userId: string, requesterRole: UserRole) {
    const targetProfile = await this.profileRepo.findOne({
      where: { id: userId },
    });

    if (!targetProfile) {
      throw new AppUnauthorizedException(
        ErrorCode.AUTH_USER_NOT_FOUND,
        'User nicht gefunden',
      );
    }

    // Nur Administratoren dürfen Password-Resets initiieren
    if (requesterRole !== UserRole.ADMINISTRATOR) {
      throw new AppForbiddenException(
        ErrorCode.AUTH_RESET_PASSWORD_FORBIDDEN,
        'Nur Administratoren dürfen Passwort-Resets durchführen',
      );
    }

    const supabase = this.supabaseService.getClient();
    const redirectTo = this.getResetPasswordRedirectUrl();

    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(
      targetProfile.email,
      options,
    );

    if (error) {
      const translated = this.translateSupabaseError(error.message);
      throw new AppUnauthorizedException(translated.code, translated.message);
    }

    return { message: 'Passwort-Reset Email versendet' };
  }

  /**
   * User-Rolle ändern (nur für Administratoren)
   * Setzt die globale funktionale Rolle (user oder administrator)
   */
  async updateUserRole(userId: string, newRole: UserRole) {
    const profile = await this.profileRepo.findOne({ where: { id: userId } });

    if (!profile) {
      throw new AppUnauthorizedException(
        ErrorCode.AUTH_USER_NOT_FOUND,
        'User nicht gefunden',
      );
    }

    profile.role = newRole;
    await this.profileRepo.save(profile);

    return { message: 'Rolle erfolgreich aktualisiert', profile };
  }

  /**
   * Alle User abrufen (nur für Administratoren)
   */
  async getAllUsers() {
    return this.profileRepo.find({
      relations: ['organizationMemberships'],
    });
  }

  /**
   * User-Profile abrufen. Die Mitgliedschaften werden bewusst gefiltert
   * geladen (archivedAt IS NULL, gleiches Muster wie
   * OrganizationMembersService.findByUser) statt per einfacher
   * TypeORM-Relation - sonst wuerde ein User weiterhin eine Organisation
   * sehen, deren Mitgliedschaft archiviert wurde (z.B. nach einem
   * Owner-Self-Delete, siehe OrganizationsService.deleteByOwner).
   */
  async getUserProfile(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { id: userId } });
    if (!profile) return null;

    profile.organizationMemberships = await this.memberRepo.find({
      where: { userId, archivedAt: IsNull() },
      relations: ['organization'],
      order: { joinedAt: 'ASC' },
    });

    return profile;
  }
}
