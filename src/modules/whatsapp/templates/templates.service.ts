// use context7
import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TemplateCategory, TemplateStatus } from '@prisma/client';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

interface MetaHttpClient {
  get(url: string, config?: { headers?: Record<string, string> }): Promise<{ data: any }>;
  delete(url: string, config?: { headers?: Record<string, string> }): Promise<{ data: any }>;
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('META_HTTP') private readonly http: MetaHttpClient,
  ) {}

  async findAll(tenantId: string) {
    return this.prisma.waTemplate.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async syncFromMeta(tenantId: string) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!account) return [];

    try {
      const response = await this.http.get(
        `${META_GRAPH_URL}/${account.wabaId}/message_templates?limit=100`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );

      const metaTemplates: any[] = response.data?.data ?? [];
      const upserted = await Promise.all(
        metaTemplates.map((tpl) =>
          this.prisma.waTemplate.upsert({
            where: { tenantId_name_language: { tenantId, name: tpl.name, language: tpl.language } },
            create: {
              tenantId,
              wabaId: account.wabaId,
              name: tpl.name,
              language: tpl.language,
              category: this.mapCategory(tpl.category),
              status: this.mapStatus(tpl.status),
              components: tpl.components ?? [],
            },
            update: {
              status: this.mapStatus(tpl.status),
              components: tpl.components ?? [],
            },
          }),
        ),
      );

      return upserted;
    } catch (err) {
      this.logger.error('Failed to sync templates from Meta', err);
      return [];
    }
  }

  async remove(tenantId: string, templateId: string): Promise<{ ok: boolean }> {
    const template = await this.prisma.waTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) throw new NotFoundException('Template not found');

    // Best-effort delete from Meta (non-blocking)
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { tenantId, isActive: true },
    });
    if (account) {
      this.http
        .delete(
          `${META_GRAPH_URL}/${account.wabaId}/message_templates?name=${template.name}`,
          { headers: { Authorization: `Bearer ${account.accessToken}` } },
        )
        .catch((err) => this.logger.warn('Meta template delete failed', err));
    }

    await this.prisma.waTemplate.delete({ where: { id: templateId } });
    return { ok: true };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private mapCategory(raw: string): TemplateCategory {
    const map: Record<string, TemplateCategory> = {
      MARKETING: 'MARKETING',
      UTILITY: 'UTILITY',
      AUTHENTICATION: 'AUTHENTICATION',
    };
    return map[raw?.toUpperCase()] ?? 'UTILITY';
  }

  private mapStatus(raw: string): TemplateStatus {
    const map: Record<string, TemplateStatus> = {
      APPROVED: 'APPROVED',
      REJECTED: 'REJECTED',
      DISABLED: 'DISABLED',
      PENDING: 'PENDING',
    };
    return map[raw?.toUpperCase()] ?? 'PENDING';
  }
}
