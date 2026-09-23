import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeEntriesService } from './time-entries.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntryEntity } from './time-entry.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeEntryEntity,
      ProjectEntity,
      ProjectCategoryEntity,
    ]),
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
  ],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
