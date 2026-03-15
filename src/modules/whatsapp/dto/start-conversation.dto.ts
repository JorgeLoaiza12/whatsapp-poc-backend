import { IsString, Matches } from 'class-validator';

export class StartConversationDto {
  /** Destination phone number, digits only no + (e.g. 56951209722) */
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'to must be 7-15 digits without + prefix' })
  to: string;

  /** The Phone Number ID to send from */
  @IsString()
  phoneNumberId: string;

  /** First message body */
  @IsString()
  body: string;
}
