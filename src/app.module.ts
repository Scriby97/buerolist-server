import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { ProjectEntity } from './projects/project.entity';
import { ProjectCategoryEntity } from './project-categories/project-category.entity';
import { TimeEntryEntity } from './time-entries/time-entry.entity';
import { NoteEntity } from './notes/note.entity';
import { NotePhotoEntity } from './notes/note-photo.entity';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { CategoriesModule } from './categories/categories.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { NotesModule } from './notes/notes.module';

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
        ProjectEntity,
        ProjectCategoryEntity,
        TimeEntryEntity,
        NoteEntity,
        NotePhotoEntity,
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
    SupabaseModule,
    AuthModule,
    OrganizationsModule,
    BillingModule,
    CustomersModule,
    CategoriesModule,
    ProjectsModule,
    TimeEntriesModule,
    NotesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
