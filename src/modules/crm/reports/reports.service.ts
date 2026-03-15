// use context7
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

// ── Segment thresholds ────────────────────────────────────────────────────────
// Exported so they can be tested and referenced by consumers.

export const SEGMENT_THRESHOLDS = {
  NEW_CLIENT_DAYS: 30,
  VIP_MIN_VISITS: 3,
  ACTIVE_PERIOD_DAYS: 90,
  AT_RISK_MIN_DAYS: 60,
  AT_RISK_MAX_DAYS: 120,
  DORMANT_MIN_DAYS: 120,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientSegment =
  | 'nuevas'
  | 'vip'
  | 'regular'
  | 'en_riesgo'
  | 'dormidas'
  | 'sin_visitas';

export interface SegmentedContact {
  contactId: string;
  name: string | null;
  waPhone: string;
  segment: ClientSegment;
  totalVisits: number;
  visitsLast90Days: number;
  lastVisitAt: Date | null;
  firstVisitAt: Date | null;
  totalRevenue: number;
}

export interface SegmentReport {
  segments: Record<ClientSegment, SegmentedContact[]>;
  totals: Record<ClientSegment, number> & { total: number };
}

export interface TopClient {
  contactId: string;
  name: string | null;
  waPhone: string;
  totalVisits: number;
  totalRevenue: number;
  lastVisitAt: Date | null;
}

export interface RetentionEntry {
  month: string;
  returnedClients: number;
  totalClients: number;
  retentionRate: number;
}

export interface ServicePopularityEntry {
  serviceName: string;
  visitCount: number;
  totalRevenue: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const diffDays = (a: Date, b: Date): number =>
  Math.floor((a.getTime() - b.getTime()) / 86_400_000);

const ALL_SEGMENTS: ClientSegment[] = [
  'nuevas',
  'vip',
  'regular',
  'en_riesgo',
  'dormidas',
  'sin_visitas',
];

const emptySegments = (): Record<ClientSegment, SegmentedContact[]> => ({
  nuevas: [],
  vip: [],
  regular: [],
  en_riesgo: [],
  dormidas: [],
  sin_visitas: [],
});

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── getSegments ─────────────────────────────────────────────────────────────

  async getSegments(tenantId: string): Promise<SegmentReport> {
    const today = new Date();
    const ninetyDaysAgo = new Date(
      today.getTime() - SEGMENT_THRESHOLDS.ACTIVE_PERIOD_DAYS * 86_400_000,
    );

    const [contacts, allTimeStats, recentStats] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId },
        select: { id: true, name: true, waPhone: true },
      }),
      this.prisma.income.groupBy({
        by: ['contactId'],
        where: { tenantId },
        _count: { id: true },
        _min: { date: true },
        _max: { date: true },
        _sum: { amount: true },
      }),
      this.prisma.income.groupBy({
        by: ['contactId'],
        where: { tenantId, date: { gte: ninetyDaysAgo } },
        _count: { id: true },
      }),
    ]);

    const allTimeMap = new Map(allTimeStats.map((r) => [r.contactId, r]));
    const recentMap = new Map(recentStats.map((r) => [r.contactId, r]));

    const segments = emptySegments();

    for (const contact of contacts) {
      const stats = allTimeMap.get(contact.id);
      const recent = recentMap.get(contact.id);

      const totalVisits = stats?._count.id ?? 0;
      const visitsLast90Days = recent?._count.id ?? 0;
      const firstVisitAt = stats?._min.date ?? null;
      const lastVisitAt = stats?._max.date ?? null;
      const totalRevenue = Number(stats?._sum.amount ?? 0);

      const segment = this.classifySegment(
        firstVisitAt,
        lastVisitAt,
        visitsLast90Days,
        today,
      );

      segments[segment].push({
        contactId: contact.id,
        name: contact.name,
        waPhone: contact.waPhone,
        segment,
        totalVisits,
        visitsLast90Days,
        firstVisitAt,
        lastVisitAt,
        totalRevenue,
      });
    }

    const totals = ALL_SEGMENTS.reduce(
      (acc, seg) => ({ ...acc, [seg]: segments[seg].length }),
      { total: contacts.length },
    ) as Record<ClientSegment, number> & { total: number };

    return { segments, totals };
  }

  // ── getTopClients ───────────────────────────────────────────────────────────

  async getTopClients(
    tenantId: string,
    by: 'visits' | 'revenue',
    limit: number,
  ): Promise<TopClient[]> {
    const [contacts, allTimeStats] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId },
        select: { id: true, name: true, waPhone: true },
      }),
      this.prisma.income.groupBy({
        by: ['contactId'],
        where: { tenantId },
        _count: { id: true },
        _max: { date: true },
        _sum: { amount: true },
      }),
    ]);

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const ranked = allTimeStats
      .map((stat) => {
        const contact = contactMap.get(stat.contactId);
        return {
          contactId: stat.contactId,
          name: contact?.name ?? null,
          waPhone: contact?.waPhone ?? '',
          totalVisits: stat._count.id,
          totalRevenue: Number(stat._sum.amount ?? 0),
          lastVisitAt: stat._max.date ?? null,
        };
      })
      .sort((a, b) =>
        by === 'visits'
          ? b.totalVisits - a.totalVisits
          : b.totalRevenue - a.totalRevenue,
      )
      .slice(0, limit);

    return ranked;
  }

  // ── getRetention ────────────────────────────────────────────────────────────

  async getRetention(tenantId: string): Promise<RetentionEntry[]> {
    const today = new Date();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);

    const incomes = await this.prisma.income.findMany({
      where: { tenantId, date: { gte: sixMonthsAgo } },
      select: { contactId: true, date: true },
    });

    // Build map: "YYYY-MM" → Set<contactId>
    const monthlyContacts = new Map<string, Set<string>>();
    for (const income of incomes) {
      const key = `${income.date.getFullYear()}-${String(income.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyContacts.has(key)) monthlyContacts.set(key, new Set());
      monthlyContacts.get(key)!.add(income.contactId);
    }

    const result: RetentionEntry[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const currentKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const prevKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

      const currentSet = monthlyContacts.get(currentKey) ?? new Set<string>();
      const prevSet = monthlyContacts.get(prevKey) ?? new Set<string>();

      const totalClients = prevSet.size;
      const returnedClients = totalClients === 0
        ? 0
        : [...prevSet].filter((id) => currentSet.has(id)).length;
      const retentionRate =
        totalClients === 0 ? 0 : Math.round((returnedClients / totalClients) * 100);

      result.push({
        month: d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
        returnedClients,
        totalClients,
        retentionRate,
      });
    }

    return result;
  }

  // ── getServicePopularity ────────────────────────────────────────────────────

  async getServicePopularity(tenantId: string): Promise<ServicePopularityEntry[]> {
    const incomes = await this.prisma.income.findMany({
      where: { tenantId },
      select: { serviceNames: true, amount: true },
    });

    // Accumulate counts and revenue per individual service name
    const statsMap = new Map<string, { visitCount: number; totalRevenue: number }>();

    for (const income of incomes) {
      const names = income.serviceNames
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const name of names) {
        const current = statsMap.get(name) ?? { visitCount: 0, totalRevenue: 0 };
        statsMap.set(name, {
          visitCount: current.visitCount + 1,
          totalRevenue: current.totalRevenue + Number(income.amount),
        });
      }
    }

    return [...statsMap.entries()]
      .map(([serviceName, stats]) => ({ serviceName, ...stats }))
      .sort((a, b) => b.visitCount - a.visitCount);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private classifySegment(
    firstVisitAt: Date | null,
    lastVisitAt: Date | null,
    visitsLast90Days: number,
    today: Date,
  ): ClientSegment {
    if (!firstVisitAt || !lastVisitAt) return 'sin_visitas';

    const daysSinceFirst = diffDays(today, firstVisitAt);
    const daysSinceLast = diffDays(today, lastVisitAt);

    if (daysSinceFirst <= SEGMENT_THRESHOLDS.NEW_CLIENT_DAYS) return 'nuevas';
    if (visitsLast90Days >= SEGMENT_THRESHOLDS.VIP_MIN_VISITS) return 'vip';
    if (visitsLast90Days >= 1) return 'regular';
    if (
      daysSinceLast >= SEGMENT_THRESHOLDS.AT_RISK_MIN_DAYS &&
      daysSinceLast <= SEGMENT_THRESHOLDS.AT_RISK_MAX_DAYS
    ) return 'en_riesgo';

    return 'dormidas';
  }
}
