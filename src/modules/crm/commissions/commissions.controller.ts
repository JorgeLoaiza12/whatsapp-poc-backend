import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { CommissionsService } from './commissions.service';
import { SetRuleDto } from './dto/set-rule.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';

@UseGuards(JwtAuthGuard)
@Controller('crm/commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthUser) {
    return this.commissionsService.getSummary(user.tenantId);
  }

  @Get('rules')
  getRules(@CurrentUser() user: AuthUser) {
    return this.commissionsService.getRules(user.tenantId);
  }

  @Post('rules')
  setRule(@CurrentUser() user: AuthUser, @Body() dto: SetRuleDto) {
    return this.commissionsService.setRule(user.tenantId, dto);
  }

  @Delete('rules/:userId')
  removeRule(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.commissionsService.removeRule(user.tenantId, userId);
  }

  @Get()
  getCommissions(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
  ) {
    return this.commissionsService.getCommissions(user.tenantId, userId, status);
  }

  @Post('mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Body() dto: MarkPaidDto) {
    return this.commissionsService.markPaid(user.tenantId, dto);
  }
}
