import { Module, forwardRef } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { BillingController } from './billing.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  // forwardRef: OrganizationsModule imports BillingModule (for StripeService in
  // OrganizationsController) and BillingModule imports OrganizationsModule (for
  // OrganizationsService/OrganizationSubscriptionsService in BillingController) -
  // genuinely circular at the module level.
  imports: [forwardRef(() => OrganizationsModule)],
  controllers: [BillingController],
  providers: [StripeService],
  exports: [StripeService],
})
export class BillingModule {}
