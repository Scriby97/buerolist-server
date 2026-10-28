import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemPresetEntity } from './item-preset.entity';
import { ItemPresetsService } from './item-presets.service';
import { ItemPresetsController } from './item-presets.controller';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemPresetEntity]),
    AuthModule,
    OrganizationsModule,
  ],
  controllers: [ItemPresetsController],
  providers: [ItemPresetsService],
})
export class ItemPresetsModule {}
