import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  IsEnum,
} from 'class-validator';
import { SubscriptionTier } from '../enums/subscription-tier.enum';

export class CreateSelfServiceOrganizationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  subdomain?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsEnum(SubscriptionTier)
  tier: SubscriptionTier;
}
