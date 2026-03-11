import { IsString } from 'class-validator';

export class ConnectCodeDto {
  /** OAuth authorization code returned by Meta's redirect flow */
  @IsString()
  code: string;

  /** The redirect_uri used during the OAuth request — must match exactly */
  @IsString()
  redirectUri: string;
}
