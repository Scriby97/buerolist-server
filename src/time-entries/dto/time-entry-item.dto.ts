import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const TIME_ENTRY_MAX_ITEMS = 50;

/** Material- oder Spesen-Position, z.B. 1 x "Patrone Kitt" a CHF 10.40. */
export class TimeEntryItemDto {
  @IsIn(['material', 'expense'])
  type: 'material' | 'expense';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  /** Stueckpreis in Rappen (CHF 10.40 = 1040) */
  @IsInt()
  @Min(0)
  @Max(100000000)
  unitPriceRappen: number;
}
