import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ItemPresetType } from '../item-preset.entity';

export class CreateItemPresetDto {
  @IsUUID()
  organizationId: string;

  @IsIn(['material', 'expense'])
  type: ItemPresetType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  /** Stueckpreis in Rappen; fehlt/null = ohne Preis */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  unitPriceRappen?: number | null;
}

export class UpdateItemPresetDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  unitPriceRappen?: number | null;
}
