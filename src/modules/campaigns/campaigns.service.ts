// use context7
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CampaignStatus } from '@prisma/client';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { SEGMENT_THRESHOLDS } from '../crm/reports/reports.service';

const CANCELLABLE_STATUSES: CampaignStatus[] = ['DRAFT', 'SCHEDULED', 'SENDING'];

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCampaignDto) {
    if (!dto.message && !dto.templateId) {
      throw new BadRequestException('Either message or templateId must be provided');
    }

    return this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        message: dto.message,
        templateId: dto.templateId,
        segment: dto.segment,
        status: 'DRAFT',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { recipients: true } },
        template: { select: { name: true, status: true } },
      },
    });
  }

  async findOne(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        recipients: {
          include: { contact: { select: { id: true, name: true, waPhone: true } } },
          orderBy: { status: 'asc' },
        },
        template: { select: { name: true, status: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async cancel(tenantId: string, campaignId: string) {
    const campaign = await this.findOrFail(tenantId, campaignId);
    if (!CANCELLABLE_STATUSES.includes(campaign.status as CampaignStatus)) {
      throw new BadRequestException(`Cannot cancel a ${campaign.status} campaign`);
    }
    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED' },
    });
  }

  async remove(tenantId: string, campaignId: string): Promise<{ ok: boolean }> {
    const campaign = await this.findOrFail(tenantId, campaignId);
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT campaigns can be deleted');
    }
    await this.prisma.campaign.delete({ where: { id: campaignId } });
    return { ok: true };
  }

  async resolveRecipients(
    tenantId: string,
    segment: string | undefined,
    contactIds: string[] | undefined,
  ): Promise<{ id: string; waPhone: string; name: string | null }[]> {
    if (contactIds?.length) {
      return this.prisma.contact.findMany({
        where: { tenantId, id: { in: contactIds } },
        select: { id: true, waPhone: true, name: true },
      });
    }

    if (!segment || segment === 'all') {
      return this.prisma.contact.findMany({
        where: { tenantId },
        select: { id: true, waPhone: true, name: true },
      });
    }

    return this.resolveSegment(tenantId, segment);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async findOrFail(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private async resolveSegment(
    tenantId: string,
    segment: string,
  ): Promise<{ id: string; waPhone: string; name: string | null }[]> {
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - SEGMENT_THRESHOLDS.ACTIVE_PERIOD_DAYS * 86_400_000);

    const [allContacts, allTimeStats, recentStats] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId },
        select: { id: true, waPhone: true, name: true },
      }),
      this.prisma.income.groupBy({
        by: ['contactId'],
        where: { tenantId },
        _count: { id: true },
        _min: { date: true },
        _max: { date: true },
      }),
      this.prisma.income.groupBy({
        by: ['contactId'],
        where: { tenantId, date: { gte: ninetyDaysAgo } },
        _count: { id: true },
      }),
    ]);

    const allTimeMap = new Map(allTimeStats.map((r) => [r.contactId, r]));
    const recentMap = new Map(recentStats.map((r) => [r.contactId, r]));

    return allContacts.filter((contact) => {
      const stats = allTimeMap.get(contact.id);
      const recent = recentMap.get(contact.id);
      return this.matchesSegment(segment, stats, recent?._count.id ?? 0, today);
    });
  }

  private matchesSegment(
    segment: string,
    stats: { _count: { id: number }; _min: { date: Date | null }; _max: { date: Date | null } } | undefined,
    visitsLast90Days: number,
    today: Date,
  ): boolean {
    const firstVisitAt = stats?._min.date ?? null;
    const lastVisitAt = stats?._max.date ?? null;

    if (!firstVisitAt || !lastVisitAt) return segment === 'sin_visitas';

    const daysSinceFirst = Math.floor((today.getTime() - firstVisitAt.getTime()) / 86_400_000);
    const daysSinceLast = Math.floor((today.getTime() - lastVisitAt.getTime()) / 86_400_000);

    switch (segment) {
      case 'nuevas':
        return daysSinceFirst <= SEGMENT_THRESHOLDS.NEW_CLIENT_DAYS;
      case 'vip':
        return (
          daysSinceFirst > SEGMENT_THRESHOLDS.NEW_CLIENT_DAYS &&
          visitsLast90Days >= SEGMENT_THRESHOLDS.VIP_MIN_VISITS
        );
      case 'regular':
        return (
          daysSinceFirst > SEGMENT_THRESHOLDS.NEW_CLIENT_DAYS &&
          visitsLast90Days >= 1 &&
          visitsLast90Days < SEGMENT_THRESHOLDS.VIP_MIN_VISITS
        );
      case 'en_riesgo':
        return (
          daysSinceLast >= SEGMENT_THRESHOLDS.AT_RISK_MIN_DAYS &&
          daysSinceLast <= SEGMENT_THRESHOLDS.AT_RISK_MAX_DAYS
        );
      case 'dormidas':
        return daysSinceLast > SEGMENT_THRESHOLDS.DORMANT_MIN_DAYS;
      default:
        return false;
    }
  }

  async exportRecipientsCsv(tenantId: string, campaignId: string): Promise<string> {
    const campaign = await this.findOne(tenantId, campaignId);
    const rows = campaign.recipients.map((r) => [
      r.contact.name ?? '',
      r.contact.waPhone,
      r.status,
      r.sentAt ? new Date(r.sentAt).toLocaleString('es-CL') : '',
    ]);

    const header = [['nombre', 'telefono', 'estado', 'enviado_at']];
    const all = [...header, ...rows];
    return all.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  }
}
