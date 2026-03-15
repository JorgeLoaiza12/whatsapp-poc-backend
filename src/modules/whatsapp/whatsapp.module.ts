import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WebhookService } from './webhook.service';
import { OnboardingController } from './onboarding.controller';
import { WebhookController } from './webhook.controller';
import { MessagesController } from './messages.controller';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';

@Module({
  controllers: [OnboardingController, WebhookController, MessagesController, TemplatesController],
  providers: [
    WhatsAppService,
    WebhookService,
    TemplatesService,
    {
      provide: 'META_HTTP',
      useFactory: () => {
        const axios = require('axios');
        return {
          get: (url: string, config?: any) => axios.get(url, config),
          delete: (url: string, config?: any) => axios.delete(url, config),
        };
      },
    },
  ],
  exports: [WhatsAppService, WebhookService, TemplatesService],
})
export class WhatsAppModule {}
