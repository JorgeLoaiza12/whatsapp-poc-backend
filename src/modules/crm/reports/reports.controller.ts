// use context7
import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('crm/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('segments')
  getSegments(@CurrentUser() user: AuthUser) {
    return this.reportsService.getSegments(user.tenantId);
  }

  @Get('top-clients')
  getTopClients(
    @CurrentUser() user: AuthUser,
    @Query('by') by: 'visits' | 'revenue' = 'visits',
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const validBy = by === 'revenue' ? 'revenue' : 'visits';
    return this.reportsService.getTopClients(user.tenantId, validBy, limit);
  }

  @Get('retention')
  getRetention(@CurrentUser() user: AuthUser) {
    return this.reportsService.getRetention(user.tenantId);
  }

  @Get('service-popularity')
  getServicePopularity(@CurrentUser() user: AuthUser) {
    return this.reportsService.getServicePopularity(user.tenantId);
  }
}
