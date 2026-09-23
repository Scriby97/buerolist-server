import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectEntity } from './project.entity';
import { ProjectCategoryEntity } from '../project-categories/project-category.entity';
import { CategoryEntity } from '../categories/category.entity';
import { TimeEntryEntity } from '../time-entries/time-entry.entity';
import { NoteEntity } from '../notes/note.entity';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      ProjectCategoryEntity,
      CategoryEntity,
      TimeEntryEntity,
      NoteEntity,
    ]),
    AuthModule,
    OrganizationsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
