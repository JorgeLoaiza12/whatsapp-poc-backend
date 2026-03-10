import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { WhatsAppService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * POST /api/messages/send
   * The frontend sends conversationId + to + phoneNumberId + body.
   * The backend looks up the tenant's access token from DB before calling Meta.
   */
  @Post('send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.whatsappService.sendMessage(
      user.tenantId,
      dto.phoneNumberId,
      dto.to,
      dto.body,
      dto.conversationId,
    );
  }
}
