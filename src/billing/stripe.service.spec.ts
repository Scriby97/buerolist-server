import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { SubscriptionTier } from '../organizations/enums/subscription-tier.enum';

describe('StripeService.getTierForPriceId', () => {
  const config = {
    get: (key: string) =>
      ({ STRIPE_PRICE_STANDARD: 'price_std', STRIPE_PRICE_PRO: 'price_pro' })[
        key
      ],
  } as unknown as ConfigService;
  const service = new StripeService(config);

  it('maps the configured prices to their tiers', () => {
    expect(service.getTierForPriceId('price_std')).toBe(
      SubscriptionTier.STANDARD,
    );
    expect(service.getTierForPriceId('price_pro')).toBe(SubscriptionTier.PRO);
  });

  it('returns null for unknown prices', () => {
    expect(service.getTierForPriceId('price_other')).toBeNull();
    expect(service.getTierForPriceId(undefined)).toBeNull();
  });
});
