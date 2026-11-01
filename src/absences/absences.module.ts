import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbsenceEntity } from './absence.entity';
import { AbsenceReasonEntity } from './absence-reason.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { AbsencesService } from './absences.service';
import {
  AbsenceReasonsController,
  AbsencesController,
} from './absences.controller';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AbsenceEntity,
      AbsenceReasonEntity,
      UserProfileEntity,
    ]),
    AuthModule,
    OrganizationsModule,
  ],
  controllers: [AbsenceReasonsController, AbsencesController],
  providers: [AbsencesService],
})
export class AbsencesModule {}
