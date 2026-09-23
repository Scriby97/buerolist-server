import { Controller, Get, Post, Body, Param, Logger } from '@nestjs/common';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AppBadRequestException, ErrorCode } from '../common/exceptions';

@Controller('invites')
export class InvitesController {
  private readonly logger = new Logger(InvitesController.name);

  constructor(
    private readonly invitesService: OrganizationsInvitesService,
    private readonly authService: AuthService,
  ) {}

  /**
   * GET /invites/mine
   * Alle offenen Einladungen für die Email-Adresse des eingeloggten Users
   * MUSS VOR /:token STEHEN!
   */
  @Get('mine')
  async getMyInvites(@CurrentUser() user: AuthUser) {
    const invites = await this.invitesService.getInvitesByEmail(user.email!);
    return invites.map((invite) => ({
      token: invite.token,
      role: invite.role,
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
      },
      expiresAt: invite.expiresAt,
    }));
  }

  /**
   * POST /invites/:token/accept
   * Akzeptiert eine Einladung als bereits eingeloggter, existierender User
   * (im Gegensatz zu POST /invites/accept, das immer einen neuen User registriert)
   */
  @Post(':token/accept')
  async acceptAsExistingUser(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.invitesService.acceptInviteForExistingUser(
      token,
      user.id,
      user.email!,
    );
    return { message: 'Erfolgreich der Organisation beigetreten' };
  }

  /**
   * POST /invites/:token/decline
   * Lehnt eine an den eingeloggten User gerichtete Einladung ab
   */
  @Post(':token/decline')
  async decline(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    await this.invitesService.declineInvite(token, user.email!);
    return { message: 'Einladung abgelehnt' };
  }

  /**
   * GET /invites/:token
   * Validiert einen Invite-Token und gibt Info zur Organisation zurück
   * PUBLIC - Kein Login erforderlich
   */
  @Public()
  @Get(':token')
  async getInviteInfo(@Param('token') token: string) {
    const invite = await this.invitesService.validateInvite(token);

    return {
      email: invite.email,
      role: invite.role,
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
      },
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * POST /invites/accept
   * Akzeptiert einen Invite und erstellt einen neuen User
   * Erstellt auch eine organization_members Eintrag mit der Rolle aus dem Invite
   * PUBLIC - Kein Login erforderlich
   */
  @Public()
  @Post('accept')
  async acceptInvite(@Body() acceptInviteDto: AcceptInviteDto) {
    this.logger.log(
      `POST /invites/accept token=${acceptInviteDto.token.substring(0, 20)}...`,
    );

    // Validiere Invite
    const invite = await this.invitesService.validateInvite(
      acceptInviteDto.token,
    );
    this.logger.log(
      `Invite validated for organization: ${invite.organization.name}`,
    );

    // Prüfe ob die Email übereinstimmt
    if (invite.email.toLowerCase() !== acceptInviteDto.email.toLowerCase()) {
      this.logger.warn(
        `Email mismatch: Invite=${invite.email}, Request=${acceptInviteDto.email}`,
      );
      throw new AppBadRequestException(
        ErrorCode.INVITE_ACCEPT_EMAIL_MISMATCH,
        'Email does not match the invited email address',
      );
    }

    // Erstelle User mit globaler "user" Rolle (nicht organization-spezifisch)
    this.logger.log(`Creating user via authService.signUp()...`);
    const result = await this.authService.signUp(
      acceptInviteDto.email,
      acceptInviteDto.password,
      {
        firstName: acceptInviteDto.firstName,
        lastName: acceptInviteDto.lastName,
      },
      UserRole.USER, // Neue User bekommen immer "user" Rolle, nie "administrator"
    );
    this.logger.log(`User created: ${result.user?.id}`);

    if (result.user) {
      // Erstelle organization_members Eintrag mit der Rolle aus dem Invite
      await this.invitesService.createMembership(
        result.user.id,
        invite.organizationId,
        invite.role,
      );
      this.logger.log(
        `Organization membership created with role: ${invite.role}`,
      );

      // Einladung ist jetzt eingeloest - loeschen statt nur markieren
      // (eingeloeste Einladungen muessen nicht mehr aufgelistet werden).
      // Erst NACH erfolgreicher Mitgliedschaft, damit der Link bei einem
      // Fehler mittendrin noch gueltig bleibt.
      await this.invitesService.deleteConsumedInvite(invite);
      this.logger.log(`Invite deleted after use`);
    } else {
      this.logger.error(
        `result.user is null/undefined - invite will NOT be deleted`,
      );
    }

    return {
      message: 'Successfully joined organization',
      user: result.user,
      session: result.session,
    };
  }
}
