import { IsBoolean, Matches } from 'class-validator';

export class UpdateReminderDto {
  @IsBoolean()
  enabled: boolean;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time muss im Format HH:mm sein (z.B. "17:30")',
  })
  time: string;
}
