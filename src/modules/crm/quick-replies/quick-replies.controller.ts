import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { QuickRepliesService } from './quick-replies.service';
import { UpsertQuickReplyDto } from './dto/upsert-quick-reply.dto';

@UseGuards(JwtAuthGuard)
@Controller('crm/quick-replies')
export class QuickRepliesController {
  constructor(private readonly quickRepliesService: QuickRepliesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.quickRepliesService.findAll(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertQuickReplyDto) {
    return this.quickRepliesService.create(user.tenantId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertQuickReplyDto,
  ) {
    return this.quickRepliesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quickRepliesService.remove(user.tenantId, id);
  }
}
