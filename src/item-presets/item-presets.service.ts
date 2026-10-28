import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemPresetEntity } from './item-preset.entity';
import {
  CreateItemPresetDto,
  UpdateItemPresetDto,
} from './dto/item-preset.dto';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';
import { saveWithNextNumber } from '../common/utils/next-number.util';

@Injectable()
export class ItemPresetsService {
  constructor(
    @InjectRepository(ItemPresetEntity)
    private readonly repo: Repository<ItemPresetEntity>,
  ) {}

  /** Katalog einer Organisation: Material vor Spesen, je nach Nummer. */
  findAll(organizationId: string): Promise<ItemPresetEntity[]> {
    return this.repo.find({
      where: { organizationId },
      order: { type: 'DESC', number: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ItemPresetEntity> {
    const preset = await this.repo.findOne({ where: { id } });
    if (!preset) {
      throw new AppNotFoundException(
        ErrorCode.ITEM_PRESET_NOT_FOUND,
        'Vorlage nicht gefunden',
        { id },
      );
    }
    return preset;
  }

  /** Neue Vorlage mit der naechsten Nummer ihres Typs (M-xxx bzw. S-xxx). */
  create(dto: CreateItemPresetDto): Promise<ItemPresetEntity> {
    return saveWithNextNumber(
      () =>
        this.repo.maximum('number', {
          organizationId: dto.organizationId,
          type: dto.type,
        }),
      (number) =>
        this.repo.save(
          this.repo.create({
            organizationId: dto.organizationId,
            type: dto.type,
            number,
            description: dto.description.trim(),
            unitPriceRappen: dto.unitPriceRappen ?? null,
          }),
        ),
    );
  }

  async update(
    id: string,
    dto: UpdateItemPresetDto,
  ): Promise<ItemPresetEntity> {
    const preset = await this.findOne(id);
    if (dto.description !== undefined) {
      preset.description = dto.description.trim();
    }
    if (dto.unitPriceRappen !== undefined) {
      preset.unitPriceRappen = dto.unitPriceRappen;
    }
    return this.repo.save(preset);
  }

  async remove(id: string): Promise<void> {
    const preset = await this.findOne(id);
    await this.repo.remove(preset);
  }
}
