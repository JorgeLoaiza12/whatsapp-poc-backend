import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** GET /api/chat/conversations */
  @Get('conversations')
  getConversations(@CurrentUser() user: AuthUser) {
    return this.chatService.getConversations(user.tenantId);
  }

  /** GET /api/chat/conversations/:id/messages — also marks as read */
  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.getMessages(user.tenantId, conversationId);
  }

  /** POST /api/chat/conversations/:id/read */
  @Post('conversations/:id/read')
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.markAsRead(user.tenantId, conversationId);
  }
}
