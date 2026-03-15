import { IsString, Matches } from 'class-validator';

export class SendMessageDto {
  @IsString()
  conversationId: string;

  /** Destination WhatsApp number, digits only no + (e.g. 5491112345678) */
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'to must be 7-15 digits without + prefix' })
  to: string;

  /** The Phone Number ID that will send this message */
  @IsString()
  phoneNumberId: string;

  @IsString()
  body: string;
}
