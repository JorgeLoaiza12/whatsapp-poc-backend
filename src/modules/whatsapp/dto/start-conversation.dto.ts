import { IsString } from 'class-validator';

export class StartConversationDto {
  /** Destination phone number in E.164 format without + (e.g. 56951209722) */
  @IsString()
  to: string;

  /** The Phone Number ID to send from */
  @IsString()
  phoneNumberId: string;

  /** First message body */
  @IsString()
  body: string;
}
