import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { RemindersService } from './reminders.service';

@UseGuards(JwtAuthGuard)
@Controller('crm/reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  findPending(@CurrentUser() user: AuthUser) {
    return this.remindersService.findPending(user.tenantId);
  }

  @Post('dismiss')
  dismiss(
    @CurrentUser() user: AuthUser,
    @Body('contactId') contactId: string,
    @Body('serviceName') serviceName: string,
  ) {
    return this.remindersService.dismiss(user.tenantId, contactId, serviceName);
  }

  @Delete('dismiss/:contactId/:serviceName')
  undismiss(
    @CurrentUser() user: AuthUser,
    @Param('contactId') contactId: string,
    @Param('serviceName') serviceName: string,
  ) {
    return this.remindersService.undismiss(user.tenantId, contactId, serviceName);
  }

  @Get('logs')
  getLogs(@CurrentUser() user: AuthUser) {
    return this.remindersService.getLogs(user.tenantId);
  }

  @Get('config')
  getConfig(@CurrentUser() user: AuthUser) {
    return this.remindersService.getConfig(user.tenantId);
  }

  @Post('config')
  updateConfig(
    @CurrentUser() user: AuthUser,
    @Body('enabled') enabled: boolean,
  ) {
    return this.remindersService.updateConfig(user.tenantId, enabled);
  }
}
