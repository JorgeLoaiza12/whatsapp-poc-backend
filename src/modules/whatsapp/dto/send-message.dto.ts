import { IsString } from 'class-validator';

export class SendMessageDto {
  @IsString()
  conversationId: string;

  /** Destination WhatsApp number in E.164 format (e.g. 5491112345678) */
  @IsString()
  to: string;

  /** The Phone Number ID that will send this message */
  @IsString()
  phoneNumberId: string;

  @IsString()
  body: string;
}
