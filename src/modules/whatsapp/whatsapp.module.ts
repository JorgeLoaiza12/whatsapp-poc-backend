import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WebhookService } from './webhook.service';
import { OnboardingController } from './onboarding.controller';
import { WebhookController } from './webhook.controller';
import { MessagesController } from './messages.controller';

@Module({
  controllers: [OnboardingController, WebhookController, MessagesController],
  providers: [WhatsAppService, WebhookService],
  exports: [WhatsAppService, WebhookService],
})
export class WhatsAppModule {}
