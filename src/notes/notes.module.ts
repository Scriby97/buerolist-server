import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { NotePhotosService } from './note-photos.service';
import { NoteEntity } from './note.entity';
import { NotePhotoEntity } from './note-photo.entity';
import { CustomerEntity } from '../customers/customer.entity';
import { ProjectEntity } from '../projects/project.entity';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NoteEntity,
      NotePhotoEntity,
      CustomerEntity,
      ProjectEntity,
    ]),
    AuthModule,
    OrganizationsModule,
    SupabaseModule,
  ],
  controllers: [NotesController],
  providers: [NotesService, NotePhotosService],
  exports: [NotesService],
})
export class NotesModule {}
