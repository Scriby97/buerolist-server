import { IsEnum } from 'class-validator';
import { SubscriptionTier } from '../enums/subscription-tier.enum';

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionTier)
  tier: SubscriptionTier;
}
