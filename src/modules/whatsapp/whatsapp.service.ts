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

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

/** Extracts a readable message from an Axios error response */
function metaErrMsg(err: any): string {
  return (
    err?.response?.data?.error?.message ??
    err?.response?.data?.message ??
    err?.message ??
    'Unknown Meta API error'
  );
}

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

  // ─── Auto-connect from FB.login() token (no BSP/TP required) ──────────────

  /**
   * Receives the short-lived token from FB.login(), exchanges it for a
   * long-lived token, then auto-discovers the WABA and phone number via
   * the Graph API — no wabaId/phoneNumberId required from the client.
   */
  async connectFromToken(tenantId: string, accessToken: string) {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');
    const appToken = `${appId}|${appSecret}`;

    // Step 1 – Verify token
    let debugData: any;
    try {
      const { data } = await axios.get(`${GRAPH_URL}/debug_token`, {
        params: { input_token: accessToken, access_token: appToken },
      });
      debugData = data;
    } catch (err) {
      const msg = metaErrMsg(err);
      this.logger.error(`debug_token failed: ${msg}`);
      throw new BadRequestException(`Token verification failed: ${msg}`);
    }

    if (!debugData.data?.is_valid) {
      throw new BadRequestException('Invalid or expired Meta access token');
    }

    this.logger.log(
      `debug_token scopes=${JSON.stringify(debugData.data?.scopes)} ` +
      `granular=${JSON.stringify(debugData.data?.granular_scopes)} ` +
      `userId=${debugData.data?.user_id}`,
    );

    // Step 2 – Exchange for long-lived token
    let longLivedToken: string;
    try {
      const { data } = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: accessToken,
        },
      });
      longLivedToken = data.access_token;
    } catch (err) {
      const msg = metaErrMsg(err);
      this.logger.error(`Token exchange failed: ${msg}`);
      throw new BadRequestException(`Token exchange failed: ${msg}`);
    }

    // Step 3a – Try /me/businesses (requires business_management scope)
    let wabaId: string | undefined;
    let phonesRaw: any[] = [];

    try {
      const { data } = await axios.get(`${GRAPH_URL}/me/businesses`, {
        params: {
          fields:
            'whatsapp_business_accounts{id,phone_numbers{id,display_phone_number,verified_name}}',
          access_token: longLivedToken,
        },
      });
      const firstWaba = data.data?.[0]?.whatsapp_business_accounts?.data?.[0];
      wabaId = firstWaba?.id;
      phonesRaw = firstWaba?.phone_numbers?.data ?? [];
      this.logger.debug(`/me/businesses → wabaId=${wabaId}`);
    } catch (err) {
      this.logger.warn(`/me/businesses: ${metaErrMsg(err)}`);
    }

    // Step 3b – Fallback: /{userId}/whatsapp_business_accounts
    if (!wabaId) {
      const userId: string = debugData.data?.user_id;
      if (userId) {
        try {
          const { data } = await axios.get(
            `${GRAPH_URL}/${userId}/whatsapp_business_accounts`,
            {
              params: {
                fields: 'id,name',
                access_token: longLivedToken,
              },
            },
          );
          wabaId = data.data?.[0]?.id;
          this.logger.debug(`/${userId}/whatsapp_business_accounts → wabaId=${wabaId}`);
        } catch (err) {
          this.logger.warn(`/userId/whatsapp_business_accounts: ${metaErrMsg(err)}`);
        }
      }
    }

    // Step 3c – Fallback: /me/whatsapp_business_accounts
    if (!wabaId) {
      try {
        const { data } = await axios.get(
          `${GRAPH_URL}/me/whatsapp_business_accounts`,
          {
            params: {
              fields: 'id,name',
              access_token: longLivedToken,
            },
          },
        );
        wabaId = data.data?.[0]?.id;
        this.logger.debug(`/me/whatsapp_business_accounts → wabaId=${wabaId}`);
      } catch (err) {
        this.logger.warn(`/me/whatsapp_business_accounts: ${metaErrMsg(err)}`);
      }
    }

    if (!wabaId) {
      throw new BadRequestException(
        'No WhatsApp Business account found. ' +
          'Grant all requested permissions and make sure your Facebook account ' +
          'is linked to a WhatsApp Business Account in Meta Business Manager.',
      );
    }

    // Step 3c – Fetch phone numbers directly if not yet loaded
    if (!phonesRaw.length) {
      try {
        const { data } = await axios.get(`${GRAPH_URL}/${wabaId}/phone_numbers`, {
          params: {
            fields: 'id,display_phone_number,verified_name',
            access_token: longLivedToken,
          },
        });
        phonesRaw = data.data ?? [];
      } catch (err) {
        const msg = metaErrMsg(err);
        this.logger.error(`phone_numbers fetch failed: ${msg}`);
        throw new BadRequestException(`Failed to fetch phone numbers: ${msg}`);
      }
    }

    if (!phonesRaw.length) {
      throw new BadRequestException(
        'No phone numbers found in the WhatsApp Business account.',
      );
    }

    const phone = phonesRaw[0];

    // Step 4 – Persist
    const account = await this.prisma.whatsAppAccount.upsert({
      where: { phoneNumberId: phone.id },
      update: {
        accessToken: longLivedToken,
        wabaId,
        displayName: phone.verified_name ?? null,
        isActive: true,
      },
      create: {
        tenantId,
        wabaId,
        phoneNumberId: phone.id,
        phoneNumber: phone.display_phone_number,
        accessToken: longLivedToken,
        displayName: phone.verified_name ?? null,
      },
    });

    this.logger.log(
      `Tenant ${tenantId} auto-connected phone ${account.phoneNumber}`,
    );
    return account;
  }

  // ─── Redirect-based Embedded Signup ────────────────────────────────────────

  /**
   * Called from the /onboarding/callback page after Meta redirects with ?code=.
   * 1. Exchanges the code for a business integration system user token (no popup needed).
   * 2. Lists the customer's WABA accounts via Graph API.
   * 3. Persists the first WABA + phone number for this tenant.
   */
  async connectViaCode(tenantId: string, code: string, redirectUri: string) {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');

    // Step 1 – Exchange code → business token
    const { data: tokenData } = await axios.get(
      'https://graph.facebook.com/v21.0/oauth/access_token',
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        },
      },
    );
    const businessToken: string = tokenData.access_token;
    if (!businessToken) {
      throw new BadRequestException('Meta did not return a business token');
    }

    // Step 2 – List WABA accounts with phone numbers
    const { data: bizData } = await axios.get(
      'https://graph.facebook.com/v21.0/me/businesses',
      {
        params: {
          fields:
            'whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}',
          access_token: businessToken,
        },
      },
    );

    const wabas: any[] =
      bizData.data?.[0]?.whatsapp_business_accounts?.data ?? [];
    if (!wabas.length) {
      throw new BadRequestException(
        'No WhatsApp Business accounts found for this Meta user',
      );
    }

    const waba = wabas[0];
    const phones: any[] = waba.phone_numbers?.data ?? [];
    if (!phones.length) {
      throw new BadRequestException(
        'No phone numbers found in the WhatsApp Business account',
      );
    }
    const phone = phones[0];

    // Step 3 – Upsert account
    const account = await this.prisma.whatsAppAccount.upsert({
      where: { phoneNumberId: phone.id },
      update: {
        accessToken: businessToken,
        wabaId: waba.id,
        displayName: phone.verified_name ?? null,
        isActive: true,
      },
      create: {
        tenantId,
        wabaId: waba.id,
        phoneNumberId: phone.id,
        phoneNumber: phone.display_phone_number,
        accessToken: businessToken,
        displayName: phone.verified_name ?? null,
      },
    });

    this.logger.log(
      `Tenant ${tenantId} connected via redirect — phone ${account.phoneNumber}`,
    );
    return account;
  }
}
