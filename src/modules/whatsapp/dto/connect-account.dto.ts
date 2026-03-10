import { IsString } from 'class-validator';

export class ConnectAccountDto {
  /** Short-lived token obtained from Facebook Embedded Signup */
  @IsString()
  accessToken: string;

  /** WhatsApp Business Account ID */
  @IsString()
  wabaId: string;

  /** Phone Number ID selected during Embedded Signup */
  @IsString()
  phoneNumberId: string;
}
