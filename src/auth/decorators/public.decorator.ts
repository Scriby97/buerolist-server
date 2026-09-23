import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator um Routen als öffentlich zu markieren (keine Auth benötigt)
 * Verwendung: @Public() auf Controller oder Route
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
