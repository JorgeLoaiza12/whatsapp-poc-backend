import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { WhatsAppService } from './whatsapp.service';
import { ConnectAccountDto } from './dto/connect-account.dto';

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

  /** GET /api/whatsapp/accounts — list linked accounts for the current tenant */
  @Get('accounts')
  getAccounts(@CurrentUser() user: AuthUser) {
    return this.whatsappService.getAccountsForTenant(user.tenantId);
  }
}
