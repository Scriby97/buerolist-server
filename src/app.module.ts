import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserProfileEntity } from './auth/entities/user-profile.entity';
import { OrganizationEntity } from './organizations/organization.entity';
import { OrganizationMemberEntity } from './organizations/organization-member.entity';
import { OrganizationSubscriptionEntity } from './organizations/organization-subscription.entity';
import { OrganizationInviteEntity } from './organizations/entities/organization-invite.entity';
import { CustomerEntity } from './customers/customer.entity';
import { CategoryEntity } from './categories/category.entity';
import { CategoryGroupEntity } from './categories/category-group.entity';
import { CategoryTemplateEntity } from './categories/category-template.entity';
import { ProjectEntity } from './projects/project.entity';
import { ProjectCategoryEntity } from './project-categories/project-category.entity';
import { TimeEntryEntity } from './time-entries/time-entry.entity';
import { TimeEntryItemEntity } from './time-entries/time-entry-item.entity';
import { NoteEntity } from './notes/note.entity';
import { NotePhotoEntity } from './notes/note-photo.entity';
import { EntryReminderEntity } from './notifications/entry-reminder.entity';
import { PushSubscriptionEntity } from './notifications/push-subscription.entity';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { CategoriesModule } from './categories/categories.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { NotesModule } from './notes/notes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ItemPresetsModule } from './item-presets/item-presets.module';
import { ItemPresetEntity } from './item-presets/item-preset.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [
        UserProfileEntity,
        OrganizationEntity,
        OrganizationMemberEntity,
        OrganizationSubscriptionEntity,
        OrganizationInviteEntity,
        CustomerEntity,
        CategoryEntity,
        CategoryGroupEntity,
        CategoryTemplateEntity,
        ProjectEntity,
        ProjectCategoryEntity,
        TimeEntryEntity,
        TimeEntryItemEntity,
        NoteEntity,
        NotePhotoEntity,
        EntryReminderEntity,
        PushSubscriptionEntity,
        ItemPresetEntity,
      ],
      synchronize: false, // Migrations sind handgeschriebenes SQL, siehe migrations/
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
      extra: {
        // Force IPv4 to avoid IPv6 connection issues on some hosts
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === 'production'
            ? {
                rejectUnauthorized: false,
              }
            : false,
      },
    }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    AuthModule,
    OrganizationsModule,
    BillingModule,
    CustomersModule,
    CategoriesModule,
    ProjectsModule,
    TimeEntriesModule,
    NotesModule,
    NotificationsModule,
    ItemPresetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
