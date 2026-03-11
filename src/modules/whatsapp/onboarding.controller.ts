import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';

class ListPhonesDto {
  @IsString()
  accessToken: string;
}

class ConnectTokenDto {
  @IsString()
  longLivedToken: string;

  @IsString()
  wabaId: string;

  @IsString()
  phoneNumberId: string;
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
   * POST /api/whatsapp/list-phones
   * Returns all real phone numbers available for the FB user to choose from.
   */
  @Post('list-phones')
  listPhones(@Body() dto: ListPhonesDto) {
    return this.whatsappService.listPhones(dto.accessToken);
  }

  /**
   * POST /api/whatsapp/connect-auto
   * Connects the phone number chosen by the user.
   */
  @Post('connect-auto')
  connectAuto(@CurrentUser() user: AuthUser, @Body() dto: ConnectTokenDto) {
    return this.whatsappService.connectFromToken(
      user.tenantId,
      dto.longLivedToken,
      dto.wabaId,
      dto.phoneNumberId,
    );
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

  /**
   * POST /api/whatsapp/subscribe-webhooks
   * Re-subscribes all linked WABAs to Meta webhooks (idempotent, safe to call anytime).
   */
  @Post('subscribe-webhooks')
  subscribeWebhooks(@CurrentUser() user: AuthUser) {
    return this.whatsappService.subscribeAllWabasForTenant(user.tenantId);
  }

  @Post('fix-contacts')
  fixContacts(@CurrentUser() user: AuthUser) {
    return this.whatsappService.fixDuplicateContacts(user.tenantId);
  }
}
