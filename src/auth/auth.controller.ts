import {
  Controller,
  Post,
  Body,
  Get,
  Headers,
  Param,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  SignInDto,
  SignUpDto,
  RefreshTokenDto,
  ResetPasswordDto,
  UpdateUserRoleDto,
} from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from './enums/user-role.enum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/signin
   * Login mit Email und Passwort
   */
  @Public()
  @Post('signin')
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto.email, dto.password);
  }

  /**
   * POST /auth/signup
   * Registrierung mit Email und Passwort
   */
  @Public()
  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(
      dto.email,
      dto.password,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        ...dto.metadata,
      },
      UserRole.USER, // Standard-Rolle
    );
  }

  /**
   * POST /auth/refresh
   * Token erneuern
   */
  @Public()
  @Post('refresh')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
  }

  /**
   * POST /auth/signout
   * Logout (benötigt Auth Token)
   */
  @Post('signout')
  signOut(@Headers('authorization') auth: string) {
    const token = auth?.substring(7); // Entferne "Bearer "
    return this.authService.signOut(token);
  }

  /**
   * POST /auth/reset-password
   * Passwort-Reset Email senden
   */
  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email);
  }

  /**
   * GET /auth/me
   * Aktuellen User abrufen (benötigt Auth Token)
   */
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getUserProfile(user.id);
  }

  /**
   * GET /auth/users
   * Alle User abrufen (nur für Administratoren)
   */
  @Roles(UserRole.ADMINISTRATOR)
  @Get('users')
  getAllUsers() {
    return this.authService.getAllUsers();
  }

  /**
   * PATCH /auth/users/:userId/role
   * User-Rolle ändern (nur für Administratoren)
   */
  @Roles(UserRole.ADMINISTRATOR)
  @Patch('users/:userId/role')
  updateUserRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.authService.updateUserRole(userId, dto.role);
  }

  /**
   * POST /auth/users/:userId/reset-password
   * Admin: Passwort-Reset Email an User senden
   */
  @Roles(UserRole.ADMINISTRATOR)
  @Post('users/:userId/reset-password')
  adminResetPassword(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.authService.adminResetPasswordByUserId(userId, user.role);
  }
}
