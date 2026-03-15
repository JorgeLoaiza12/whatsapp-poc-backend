import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignSendProcessor, CAMPAIGN_SEND_QUEUE } from './campaign-send.processor';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    WhatsAppModule,
    BullModule.registerQueue({ name: CAMPAIGN_SEND_QUEUE }),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignSendProcessor,
    { provide: 'CAMPAIGNS_SERVICE', useExisting: CampaignsService },
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
