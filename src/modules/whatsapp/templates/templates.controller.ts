// use context7
import { Controller, Get, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { TemplatesService } from './templates.service';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.templatesService.findAll(user.tenantId);
  }

  @Post('sync')
  sync(@CurrentUser() user: AuthUser) {
    return this.templatesService.syncFromMeta(user.tenantId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templatesService.remove(user.tenantId, id);
  }
}
