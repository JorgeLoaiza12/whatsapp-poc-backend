import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, Res, Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CAMPAIGN_SEND_QUEUE, CampaignSendJobData } from './campaign-send.processor';

@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    @InjectQueue(CAMPAIGN_SEND_QUEUE) private readonly sendQueue: Queue<CampaignSendJobData>,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.campaignsService.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaignsService.findOne(user.tenantId, id);
  }

  @Get(':id/export')
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.campaignsService.exportRecipientsCsv(user.tenantId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.csv"`);
    return csv;
  }

  @Post(':id/send')
  async send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.sendQueue.add(
      'send-campaign',
      { tenantId: user.tenantId, campaignId: id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );
    return { message: 'Campaign sending queued' };
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaignsService.cancel(user.tenantId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaignsService.remove(user.tenantId, id);
  }
}
