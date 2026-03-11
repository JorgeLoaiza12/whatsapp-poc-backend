import { Controller, Post, Get, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { IsString } from 'class-validator';

class ConnectTokenDto {
  @IsString()
  accessToken: string;
}
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { WhatsAppService } from './whatsapp.service';
import { ConnectAccountDto } from './dto/connect-account.dto';
import { ConnectCodeDto } from './dto/connect-code.dto';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class OnboardingController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * POST /api/whatsapp/connect
   * Receives the accessToken from Embedded Signup, validates it against Meta,
   * exchanges for a long-lived token, and links the WhatsApp account to the tenant.
   */
  @Post('connect')
  connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectAccountDto) {
    return this.whatsappService.connectAccount(user.tenantId, dto);
  }

  /**
   * POST /api/whatsapp/connect-auto
   * Receives the short-lived token from FB.login() (no embedded signup extras),
   * auto-discovers the WABA and phone number from the Graph API.
   * Works without BSP/TP status.
   */
  @Post('connect-auto')
  connectAuto(@CurrentUser() user: AuthUser, @Body() dto: ConnectTokenDto) {
    return this.whatsappService.connectFromToken(user.tenantId, dto.accessToken);
  }

  /**
   * POST /api/whatsapp/connect-code
   * Redirect-based Embedded Signup: receives the OAuth code from the frontend
   * callback page, exchanges it for a business token, and links the account.
   */
  @Post('connect-code')
  connectViaCode(@CurrentUser() user: AuthUser, @Body() dto: ConnectCodeDto) {
    return this.whatsappService.connectViaCode(
      user.tenantId,
      dto.code,
      dto.redirectUri,
    );
  }

  /** GET /api/whatsapp/accounts — list linked accounts for the current tenant */
  @Get('accounts')
  getAccounts(@CurrentUser() user: AuthUser) {
    return this.whatsappService.getAccountsForTenant(user.tenantId);
  }
}
