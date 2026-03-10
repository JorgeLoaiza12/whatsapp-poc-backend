import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Direction, MessageStatus, MessageType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ConnectAccountDto } from './dto/connect-account.dto';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Onboarding ────────────────────────────────────────────────────────────

  /**
   * 1. Validates the short-lived token with Meta's debug_token endpoint.
   * 2. Exchanges it for a long-lived token.
   * 3. Fetches phone number metadata from the Graph API.
   * 4. Upserts the WhatsAppAccount record for this tenant.
   */
  async connectAccount(tenantId: string, dto: ConnectAccountDto) {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');
    const appToken = `${appId}|${appSecret}`;

    // Step 1 – Verify token
    const { data: debugResp } = await axios.get(`${GRAPH_URL}/debug_token`, {
      params: { input_token: dto.accessToken, access_token: appToken },
    });
    if (!debugResp.data?.is_valid) {
      throw new BadRequestException('Invalid or expired Meta access token');
    }

    // Step 2 – Exchange for long-lived token
    const { data: tokenResp } = await axios.get(
      `${GRAPH_URL}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: dto.accessToken,
        },
      },
    );
    const longLivedToken: string = tokenResp.access_token;

    // Step 3 – Fetch phone number details
    const { data: phoneResp } = await axios.get(
      `${GRAPH_URL}/${dto.phoneNumberId}`,
      {
        params: {
          fields: 'display_phone_number,verified_name',
          access_token: longLivedToken,
        },
      },
    );

    // Step 4 – Persist
    const account = await this.prisma.whatsAppAccount.upsert({
      where: { phoneNumberId: dto.phoneNumberId },
      update: {
        accessToken: longLivedToken,
        wabaId: dto.wabaId,
        displayName: phoneResp.verified_name,
        isActive: true,
      },
      create: {
        tenantId,
        wabaId: dto.wabaId,
        phoneNumberId: dto.phoneNumberId,
        phoneNumber: phoneResp.display_phone_number,
        accessToken: longLivedToken,
        displayName: phoneResp.verified_name,
      },
    });

    this.logger.log(
      `Tenant ${tenantId} connected phone ${account.phoneNumber}`,
    );
    return account;
  }

  async getAccountsForTenant(tenantId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        phoneNumberId: true,
        wabaId: true,
        createdAt: true,
      },
    });
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  /**
   * Sends a text message via the Meta Graph API and persists the outbound record.
   * Looks up the tenant's access token from the DB — never trusts the client to send it.
   */
  async sendMessage(
    tenantId: string,
    phoneNumberId: string,
    to: string,
    body: string,
    conversationId: string,
  ) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { phoneNumberId, tenantId, isActive: true },
    });
    if (!account) {
      throw new NotFoundException(
        'No active WhatsApp account found for this tenant',
      );
    }

    const { data: metaResp } = await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const waMessageId: string | undefined = metaResp.messages?.[0]?.id;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          waMessageId,
          direction: Direction.OUTBOUND,
          type: MessageType.TEXT,
          body,
          status: MessageStatus.SENT,
          timestamp: new Date(),
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  async getAccountByPhoneNumberId(phoneNumberId: string) {
    return this.prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });
  }
}
