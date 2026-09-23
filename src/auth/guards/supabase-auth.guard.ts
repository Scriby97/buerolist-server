import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserProfileEntity } from '../entities/user-profile.entity';
import { UserRole } from '../enums/user-role.enum';
import { AppUnauthorizedException, ErrorCode } from '../../common/exceptions';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  // Verifies Supabase access tokens locally (JWKS is fetched once and cached
  // by `jose`) instead of calling Supabase's /auth/v1/user endpoint on every
  // request - that remote call was observed taking 30+ seconds under load,
  // blowing past the frontend's fetch timeout on every single request.
  private readonly jwks = createRemoteJWKSet(
    new URL(
      `${(process.env.SUPABASE_URL || '').trim()}/auth/v1/.well-known/jwks.json`,
    ),
    // Generous timeout as a safety net in case the connection to Supabase is
    // still slow (jose's default is 5s, too tight for that observed latency)
    { timeoutDuration: 20_000 },
  );

  constructor(
    private reflector: Reflector,
    @InjectRepository(UserProfileEntity)
    private profileRepo: Repository<UserProfileEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Prüfe ob Route als public markiert ist
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Route ist als public markiert - überspringe Auth');
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    this.logger.debug(`Auth Header: ${authHeader ? 'vorhanden' : 'fehlt'}`);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Kein gültiger Authorization Header');
      throw new AppUnauthorizedException(
        ErrorCode.AUTH_MISSING_HEADER,
        'Kein gültiger Authorization Header',
      );
    }

    const token = authHeader.substring(7); // Entferne "Bearer "
    this.logger.debug(`Token (erste 20 Zeichen): ${token.substring(0, 20)}...`);

    try {
      // Verifiziere Token lokal via JWKS (kein Netzwerk-Roundtrip zu Supabase)
      const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
      let payload: Record<string, unknown>;
      try {
        const result = await jwtVerify(token, this.jwks, {
          issuer: `${supabaseUrl}/auth/v1`,
          audience: 'authenticated',
        });
        payload = result.payload;
      } catch (verifyError) {
        const message =
          verifyError instanceof Error ? verifyError.message : 'Unknown error';
        this.logger.error(`JWT-Verifizierung fehlgeschlagen: ${message}`);
        throw new AppUnauthorizedException(
          ErrorCode.AUTH_TOKEN_VERIFICATION_FAILED,
          `Ungültiges Token: ${message}`,
          { reason: message },
        );
      }

      const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
      const userEmail =
        typeof payload.email === 'string' ? payload.email : undefined;
      const userMetadata =
        (payload.user_metadata as Record<string, unknown> | undefined) ?? {};

      if (!userId) {
        this.logger.warn('Token ohne gültige User-ID (sub)');
        throw new AppUnauthorizedException(
          ErrorCode.AUTH_TOKEN_INVALID,
          'Ungültiges Token',
        );
      }

      this.logger.debug(`User erfolgreich authentifiziert: ${userEmail}`);

      // Hole User-Profile mit Rolle aus DB
      let profile = await this.profileRepo.findOne({
        where: { id: userId },
      });

      this.logger.debug(
        `DB Lookup für User ID: ${userId}, Email: ${userEmail}`,
      );
      this.logger.debug(`Gefundenes Profil: ${JSON.stringify(profile)}`);

      // Erstelle automatisch ein Profile, falls es nicht existiert
      if (!profile) {
        // Es könnte bereits ein Profil mit dieser Email existieren, aber unter
        // einer anderen ID (z.B. verwaister Eintrag von einem gelöschten und
        // neu erstellten Supabase Auth User). Da Supabase Emails pro Auth-User
        // eindeutig hält, ist das eindeutig derselbe Account - repariere die ID
        // statt an der Unique-Constraint auf email zu scheitern.
        const existingByEmail = await this.profileRepo.findOne({
          where: { email: userEmail! },
        });

        if (existingByEmail) {
          this.logger.warn(
            `Verwaistes Profil für ${userEmail} gefunden (alte ID: ${existingByEmail.id}, aktuelle Auth-ID: ${userId}) - repariere ID`,
          );
          try {
            await this.profileRepo.update(
              { id: existingByEmail.id },
              { id: userId },
            );
            profile = await this.profileRepo.findOne({
              where: { id: userId },
            });
          } catch (repairError) {
            const repairMessage =
              repairError instanceof Error
                ? repairError.message
                : 'Unknown error';
            this.logger.error(
              `Konnte verwaistes Profil für ${userEmail} nicht reparieren: ${repairMessage}`,
            );
            throw new AppUnauthorizedException(
              ErrorCode.AUTH_PROFILE_CONFLICT,
              'Für diese E-Mail-Adresse existiert bereits ein Profil mit abweichender ID. Bitte kontaktiere den Support.',
            );
          }
        } else {
          this.logger.log(`Erstelle neues User-Profile für ${userEmail}`);
          profile = this.profileRepo.create({
            id: userId,
            email: userEmail!,
            role: UserRole.USER, // Standard-Rolle
            firstName: userMetadata.firstName as string | undefined,
            lastName: userMetadata.lastName as string | undefined,
          });
          await this.profileRepo.save(profile);
        }
      }

      if (!profile) {
        throw new AppUnauthorizedException(
          ErrorCode.AUTH_PROFILE_LOAD_FAILED,
          'Benutzerprofil konnte nicht geladen werden',
        );
      }

      // Füge User zu Request hinzu für späteren Zugriff
      request.user = {
        id: userId,
        email: userEmail,
        ...userMetadata,
        role: profile.role, // DB-Rolle hat Priorität über metadata
      };

      this.logger.debug(`User Rolle: ${request.user.role}`);

      return true;
    } catch (error) {
      if (error instanceof AppUnauthorizedException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token-Validierung fehlgeschlagen: ${errorMessage}`);
      throw new AppUnauthorizedException(
        ErrorCode.AUTH_UNAUTHORIZED_GENERIC,
        'Token-Validierung fehlgeschlagen',
      );
    }
  }
}
