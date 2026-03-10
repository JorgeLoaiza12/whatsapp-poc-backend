import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { WebhookService } from './webhook.service';

/**
 * Centralized webhook endpoint for all tenants.
 * Meta sends all events to a single URL; we route them by phoneNumberId.
 * Route: /api/webhook (note: no global prefix stripped here — nest applies /api)
 */
@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/webhook
   * Meta calls this once to verify the webhook subscription.
   */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = this.config.getOrThrow('META_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  /**
   * POST /api/webhook
   * Receives inbound messages, status updates, etc.
   * Must respond 200 immediately; processing is async.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Body() body: unknown) {
    // Fire-and-forget — Meta retries if we don't respond 200 quickly
    this.webhookService.processPayload(body).catch(() => null);
    return { status: 'ok' };
  }
}
