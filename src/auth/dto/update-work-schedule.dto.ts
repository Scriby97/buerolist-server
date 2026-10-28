import { Matches } from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const message = 'Zeit muss im Format HH:mm sein (z.B. "07:15")';

/** Normaler Arbeitstag: Vormittag von/bis, Nachmittag von/bis. */
export class UpdateWorkScheduleDto {
  @Matches(HH_MM, { message })
  workMorningStart: string;

  @Matches(HH_MM, { message })
  workMorningEnd: string;

  @Matches(HH_MM, { message })
  workAfternoonStart: string;

  @Matches(HH_MM, { message })
  workAfternoonEnd: string;
}
